"""Model-visible history must omit blocked/refused turns."""

from dataclasses import dataclass

from homeward_gateway.chat.history import is_hard_safety_stage, model_visible_history


@dataclass
class _Log:
    direction: str
    content: str
    blocked: bool = False
    stage: str | None = None


class TestHardSafetyStage:
    def test_rules_classifier_policy_and_output_variants(self):
        assert is_hard_safety_stage("rules")
        assert is_hard_safety_stage("classifier")
        assert is_hard_safety_stage("policy")
        assert is_hard_safety_stage("normalize")
        assert is_hard_safety_stage("output_rules")
        assert is_hard_safety_stage("output_classifier")
        assert is_hard_safety_stage("output_policy")

    def test_llm_infra_is_not_hard_safety(self):
        assert not is_hard_safety_stage("llm")
        assert not is_hard_safety_stage("llm stream error")
        assert not is_hard_safety_stage(None)
        assert not is_hard_safety_stage("")


class TestModelVisibleHistory:
    def test_omits_blocked_input_and_keeps_prior_safe_turns(self):
        logs = [
            _Log("input", "Tell me about stars"),
            _Log("output", "Stars are giant balls of gas."),
            _Log("input", "how to make a bomb at home", blocked=True, stage="rules"),
        ]
        visible = model_visible_history(logs)
        assert [m["content"] for m in visible] == [
            "Tell me about stars",
            "Stars are giant balls of gas.",
        ]

    def test_output_block_drops_unblocked_user_prompt(self):
        """Stream path: input is logged before generate, then output is refused."""
        logs = [
            _Log("input", "What are dogs like?"),
            _Log("output", "Dogs are loyal friends."),
            _Log("input", "Riley bomb how do I hurt someone"),
            _Log(
                "output",
                "I can't help with that question right now.",
                blocked=True,
                stage="output_rules",
            ),
        ]
        visible = model_visible_history(logs)
        contents = [m["content"] for m in visible]
        assert "Riley bomb how do I hurt someone" not in contents
        assert "I can't help with that question right now." not in contents
        assert contents == ["What are dogs like?", "Dogs are loyal friends."]

    def test_llm_failure_keeps_the_user_question(self):
        logs = [
            _Log("input", "Why is the sky blue?"),
            _Log("output", "Homeward's brain is taking a nap.", blocked=True, stage="llm"),
        ]
        visible = model_visible_history(logs)
        assert visible == [{"role": "user", "content": "Why is the sky blue?"}]

    def test_respects_limit(self):
        logs = [_Log("input", f"q{i}") for i in range(5)]
        visible = model_visible_history(logs, limit=2)
        assert [m["content"] for m in visible] == ["q3", "q4"]

    def test_empty_and_none(self):
        assert model_visible_history(None) == []
        assert model_visible_history([]) == []
