"""Safety pipeline orchestration — fail-closed on every stage."""

from dataclasses import dataclass
from typing import AsyncIterator

from homeward_gateway.pipeline.classifier import classify
from homeward_gateway.pipeline.normalize import normalize
from homeward_gateway.pipeline.policy import PolicyPreset, check_policy_match
from homeward_gateway.pipeline.rules import check_rules
from homeward_gateway.models.router import generate_response, stream_response


@dataclass
class PipelineResult:
    allowed: bool
    content: str | None = None
    block_reason: str | None = None
    stage: str | None = None


async def filter_input(
    text: str,
    preset: PolicyPreset,
    strictness: int,
    classifier_model: str | None = None,
) -> PipelineResult:
    """Run input through all safety stages. Fail-closed on any error."""
    # Stage 1: Normalize
    try:
        normalized = normalize(text)
    except Exception:
        return PipelineResult(allowed=False, block_reason="normalize error", stage="normalize")

    if not normalized:
        return PipelineResult(allowed=False, block_reason="empty message", stage="normalize")

    # Stage 2: Fast rules
    try:
        rule_result = check_rules(
            normalized,
            extra_keywords=preset.blocked_keywords,
            extra_jailbreaks=preset.jailbreak_patterns,
        )
        if not rule_result.allowed:
            return PipelineResult(
                allowed=False,
                block_reason=rule_result.reason,
                stage=rule_result.stage,
            )
    except Exception:
        return PipelineResult(allowed=False, block_reason="rules error", stage="rules")

    # Stage 3: Classifier
    try:
        classifier_result = await classify(normalized, strictness, model=classifier_model)
        if not classifier_result.allowed:
            return PipelineResult(
                allowed=False,
                block_reason=classifier_result.reason,
                stage=classifier_result.stage,
            )
    except Exception:
        return PipelineResult(allowed=False, block_reason="classifier error", stage="classifier")

    # Stage 4: Policy match
    try:
        policy_ok, policy_reason = check_policy_match(normalized, preset, strictness)
        if not policy_ok:
            return PipelineResult(allowed=False, block_reason=policy_reason, stage="policy")
    except Exception:
        return PipelineResult(allowed=False, block_reason="policy error", stage="policy")

    return PipelineResult(allowed=True, content=normalized)


async def filter_output(
    text: str,
    preset: PolicyPreset,
    strictness: int,
    classifier_model: str | None = None,
) -> PipelineResult:
    """Run output through safety stages before delivering to child."""
    try:
        normalized = normalize(text, max_length=preset.max_response_length)
    except Exception:
        return PipelineResult(allowed=False, block_reason="output normalize error", stage="normalize")

    try:
        rule_result = check_rules(
            normalized,
            extra_keywords=preset.blocked_keywords,
            extra_jailbreaks=preset.jailbreak_patterns,
        )
        if not rule_result.allowed:
            return PipelineResult(
                allowed=False,
                block_reason=rule_result.reason,
                stage=f"output_{rule_result.stage}",
            )
    except Exception:
        return PipelineResult(allowed=False, block_reason="output rules error", stage="rules")

    try:
        classifier_result = await classify(normalized, strictness, model=classifier_model)
        if not classifier_result.allowed:
            return PipelineResult(
                allowed=False,
                block_reason=classifier_result.reason,
                stage=f"output_{classifier_result.stage}",
            )
    except Exception:
        return PipelineResult(allowed=False, block_reason="output classifier error", stage="classifier")

    try:
        policy_ok, policy_reason = check_policy_match(normalized, preset, strictness)
        if not policy_ok:
            return PipelineResult(allowed=False, block_reason=policy_reason, stage="output_policy")
    except Exception:
        return PipelineResult(allowed=False, block_reason="output policy error", stage="policy")

    return PipelineResult(allowed=True, content=normalized)


async def process_chat(
    user_message: str,
    messages: list[dict],
    preset: PolicyPreset,
    strictness: int,
    child_name: str,
    age: int,
    chat_model: str | None = None,
    classifier_model: str | None = None,
) -> PipelineResult:
    """Full pipeline: filter input → LLM → filter output."""
    input_result = await filter_input(user_message, preset, strictness, classifier_model)
    if not input_result.allowed:
        return input_result

    try:
        response = await generate_response(
            messages + [{"role": "user", "content": input_result.content}],
            child_name,
            age,
            preset.name,
            preset.max_response_length,
            model=chat_model,
        )
    except Exception:
        return PipelineResult(allowed=False, block_reason="llm error", stage="llm")

    output_result = await filter_output(response, preset, strictness, classifier_model)
    if not output_result.allowed:
        return output_result

    return PipelineResult(allowed=True, content=output_result.content)


async def process_chat_stream(
    user_message: str,
    messages: list[dict],
    preset: PolicyPreset,
    strictness: int,
    child_name: str,
    age: int,
    chat_model: str | None = None,
    classifier_model: str | None = None,
) -> AsyncIterator[str | PipelineResult]:
    """Stream pipeline: filter input first, then stream LLM, filter output at end."""
    input_result = await filter_input(user_message, preset, strictness, classifier_model)
    if not input_result.allowed:
        yield input_result
        return

    collected = []
    try:
        async for token in stream_response(
            messages + [{"role": "user", "content": input_result.content}],
            child_name,
            age,
            preset.name,
            preset.max_response_length,
            model=chat_model,
        ):
            collected.append(token)
            yield token
    except Exception:
        yield PipelineResult(allowed=False, block_reason="llm stream error", stage="llm")
        return

    full_response = "".join(collected)
    output_result = await filter_output(full_response, preset, strictness, classifier_model)
    if not output_result.allowed:
        yield PipelineResult(allowed=False, block_reason=output_result.block_reason, stage=output_result.stage)
