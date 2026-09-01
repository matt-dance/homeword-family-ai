"""Policy preset loading and schema sanity tests."""

from pathlib import Path

import yaml

from homeward_gateway.pipeline.policy import load_all_presets, preset_for_age


POLICIES_DIR = Path(__file__).resolve().parents[2] / "policies"


class TestPolicyPresets:
    def test_all_preset_files_exist(self):
        for name in ("young_explorer", "curious_explorer", "teen_guided"):
            assert (POLICIES_DIR / f"{name}.yaml").exists()

    def test_presets_have_required_rules(self):
        presets = load_all_presets()
        for preset in presets.values():
            assert preset.max_response_length >= 500
            assert preset.strictness_default >= 1
            assert len(preset.blocked_keywords) > 0
            assert len(preset.jailbreak_patterns) > 0

    def test_preset_for_age_maps_correctly(self):
        presets = load_all_presets()
        assert preset_for_age(7, presets).id == "young_explorer"
        assert preset_for_age(10, presets).id == "curious_explorer"
        assert preset_for_age(15, presets).id == "teen_guided"

    def test_yaml_files_parse(self):
        for path in POLICIES_DIR.glob("*.yaml"):
            data = yaml.safe_load(path.read_text())
            assert "id" in data
            assert "rules" in data
            assert "max_response_length" in data["rules"]
