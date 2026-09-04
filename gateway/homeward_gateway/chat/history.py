"""Model-visible chat history — separate from parent audit logs.

Blocked or refused turns stay in conversation_logs / blocked_attempts for
parents. They must not be replayed to the model on later benign turns.
"""

from __future__ import annotations

from typing import Any

_HARD_SAFETY_STAGE_ROOTS = frozenset({"rules", "classifier", "policy", "normalize"})


def is_hard_safety_stage(stage: str | None) -> bool:
    """True for policy/rules/classifier refusals, including output_* variants.

    LLM / infra failures are not hard-safety blocks; those should not wipe
    session context or drop the child's otherwise-allowed question.
    """
    if not stage:
        return False
    root = stage.removeprefix("output_")
    return root in _HARD_SAFETY_STAGE_ROOTS


def _role_for(log: Any) -> str:
    direction = getattr(log, "direction", "") or ""
    return "user" if direction == "input" else "assistant"


def model_visible_history(logs: list[Any] | None, *, limit: int = 20) -> list[dict]:
    """Build the turn list the model may see.

    - Omit any log marked blocked.
    - If a hard-safety block is an assistant/output row, also omit the
      preceding user prompt even when that input row was stored unblocked
      (stream path: input is logged at generate-start, then output is refused).
    - Keep prior allowed turns so benign follow-ups still have safe context.
    """
    visible: list[dict] = []
    for log in logs or []:
        blocked = bool(getattr(log, "blocked", False))
        stage = getattr(log, "stage", None)
        role = _role_for(log)
        content = getattr(log, "content", None) or ""

        if blocked:
            if role == "assistant" and is_hard_safety_stage(stage) and visible:
                if visible[-1]["role"] == "user":
                    visible.pop()
            continue

        if not str(content).strip():
            continue
        visible.append({"role": role, "content": content})

    if limit > 0:
        return visible[-limit:]
    return visible
