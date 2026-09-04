"""Child read-aloud voice gender and engine mapping."""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

from homeward_gateway.voice.voices import (
    DEFAULT_VOICE_GENDER,
    KOKORO_VOICES,
    PIPER_VOICES,
    normalize_voice_gender,
    resolve_voice,
)
from tests.conftest import create_child, setup_parent


class TestVoiceMapping:
    def test_default_is_female(self):
        assert normalize_voice_gender(None) == "female"
        assert normalize_voice_gender("") == "female"
        assert normalize_voice_gender("nope") == "female"

    def test_accepts_male_and_female(self):
        assert normalize_voice_gender("male") == "male"
        assert normalize_voice_gender("Female") == "female"
        assert normalize_voice_gender("MALE") == "male"

    def test_piper_voices_differ_by_gender(self):
        female = resolve_voice("female", engine="piper")
        male = resolve_voice("male", engine="piper")
        assert female.name == PIPER_VOICES["female"]
        assert male.name == PIPER_VOICES["male"]
        assert female.name != male.name
        assert female.engine == "piper"

    def test_kokoro_voices_differ_by_gender(self):
        female = resolve_voice("female", engine="kokoro")
        male = resolve_voice("male", engine="kokoro")
        assert female.name == KOKORO_VOICES["female"]
        assert male.name == KOKORO_VOICES["male"]
        assert female.name != male.name
        assert female.engine == "kokoro"

    def test_prefers_kokoro_when_available(self):
        with patch("homeward_gateway.voice.voices.kokoro_available", return_value=True):
            voice = resolve_voice("male")
        assert voice.engine == "kokoro"
        assert voice.name == KOKORO_VOICES["male"]

    def test_falls_back_to_piper(self):
        with patch("homeward_gateway.voice.voices.kokoro_available", return_value=False):
            voice = resolve_voice("male")
        assert voice.engine == "piper"
        assert voice.name == PIPER_VOICES["male"]


class TestChildVoiceGenderAPI:
    @pytest.mark.asyncio
    async def test_create_defaults_to_female(self, client: AsyncClient):
        await setup_parent(client)
        child = await create_child(client)
        assert child["voice_gender"] == DEFAULT_VOICE_GENDER

    @pytest.mark.asyncio
    async def test_create_and_update_voice_gender(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.post(
            "/api/v1/children",
            json={"name": "Sam", "age": 10, "strictness": 3, "voice_gender": "male"},
        )
        assert resp.status_code == 200
        child = resp.json()
        assert child["voice_gender"] == "male"

        patched = await client.patch(
            f"/api/v1/children/{child['id']}",
            json={"voice_gender": "female"},
        )
        assert patched.status_code == 200
        assert patched.json()["voice_gender"] == "female"

        public = await client.get("/api/v1/children/public")
        assert public.status_code == 200
        listed = next(item for item in public.json() if item["id"] == child["id"])
        assert listed["voice_gender"] == "female"

    @pytest.mark.asyncio
    async def test_rejects_invalid_voice_gender(self, client: AsyncClient):
        await setup_parent(client)
        resp = await client.post(
            "/api/v1/children",
            json={"name": "Sam", "age": 10, "strictness": 3, "voice_gender": "robot"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_speak_passes_voice_gender(self, client: AsyncClient):
        payload = {
            "audio_base64": "UklGRi4=",
            "words": [{"word": "Hello", "start": 0.0, "end": 0.4}],
            "duration": 0.4,
        }
        with patch(
            "homeward_gateway.api.routes.synthesize_speech_payload",
            return_value=payload,
        ) as synthesize:
            resp = await client.post(
                "/api/v1/chat/speak",
                json={"text": "Hello stars", "voice_gender": "male"},
            )
        assert resp.status_code == 200
        synthesize.assert_called_once()
        assert synthesize.call_args.kwargs.get("voice_gender") == "male" or (
            len(synthesize.call_args.args) >= 2
            and synthesize.call_args.args[1] == "male"
        )
