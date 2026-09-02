"""Ollama service tests with mocked HTTP."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from homeward_gateway.ollama import service as ollama_service


@pytest.fixture(autouse=True)
def _reset_working_url():
    ollama_service._working_ollama_url = None
    yield
    ollama_service._working_ollama_url = None


class TestOllamaService:
    def test_url_candidates_try_ipv4_when_localhost_is_configured(self):
        from homeward_gateway.config import settings

        original = settings.ollama_base_url
        settings.ollama_base_url = "http://localhost:11434"
        try:
            urls = ollama_service._ollama_url_candidates()
            assert urls[0] == "http://localhost:11434"
            assert "http://127.0.0.1:11434" in urls
        finally:
            settings.ollama_base_url = original

    @pytest.mark.asyncio
    async def test_is_ollama_reachable_falls_back_to_ipv4(self):
        from homeward_gateway.config import settings

        original = settings.ollama_base_url
        settings.ollama_base_url = "http://localhost:11434"

        async def fake_probe(url: str) -> bool:
            return url == "http://127.0.0.1:11434"

        try:
            with patch.object(ollama_service, "_probe_ollama", side_effect=fake_probe):
                assert await ollama_service.is_ollama_reachable() is True
                assert ollama_service._working_ollama_url == "http://127.0.0.1:11434"
        finally:
            settings.ollama_base_url = original

    @pytest.mark.asyncio
    async def test_is_ollama_reachable_true(self):
        mock_response = MagicMock(status_code=200)
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

        with patch("homeward_gateway.ollama.service.httpx.AsyncClient", return_value=mock_client):
            assert await ollama_service.is_ollama_reachable() is True

    @pytest.mark.asyncio
    async def test_is_ollama_reachable_false_on_error(self):
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.get = AsyncMock(side_effect=ConnectionError("down"))

        with patch("homeward_gateway.ollama.service.httpx.AsyncClient", return_value=mock_client):
            assert await ollama_service.is_ollama_reachable() is False

    @pytest.mark.asyncio
    async def test_list_installed_models(self):
        mock_response = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"models": [{"name": "llama3.2:3b"}]}),
        )
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value.get = AsyncMock(return_value=mock_response)

        with patch("homeward_gateway.ollama.service.httpx.AsyncClient", return_value=mock_client):
            models = await ollama_service.list_installed_models()
            assert models == ["llama3.2:3b"]

    @pytest.mark.asyncio
    async def test_get_status_ready_when_model_installed(self):
        with patch.object(ollama_service, "is_ollama_reachable", return_value=True), patch.object(
            ollama_service, "list_installed_models", return_value=["llama3.2:3b"]
        ):
            status = await ollama_service.get_status("llama3.2:3b", "llama3.2:3b")
            assert status["reachable"] is True
            assert status["ready"] is True
            assert status["chat_model_ready"] is True

    @pytest.mark.asyncio
    async def test_get_status_not_ready_when_model_missing(self):
        with patch.object(ollama_service, "is_ollama_reachable", return_value=True), patch.object(
            ollama_service, "list_installed_models", return_value=[]
        ):
            status = await ollama_service.get_status("llama3.2:3b", "llama3.2:3b")
            assert status["reachable"] is True
            assert status["ready"] is False

    def test_validate_model_id_rejects_unknown(self):
        with pytest.raises(ValueError, match="Unknown model"):
            ollama_service.validate_model_id("not-a-real-model")

    def test_validate_model_id_accepts_catalog_model(self):
        ollama_service.validate_model_id("llama3.2:3b")

    @pytest.mark.asyncio
    async def test_recommendations_marks_too_large_models(self):
        with patch.object(ollama_service, "is_ollama_reachable", return_value=False), patch.object(
            ollama_service, "get_system_ram_gb", return_value=(4.0, "test")
        ):
            data = await ollama_service.get_recommendations("llama3.2:3b", "llama3.2:3b")
            llama3 = next(m for m in data["models"] if m["id"] == "llama3.2:3b")
            llama1 = next(m for m in data["models"] if m["id"] == "llama3.2:1b")
            assert llama1["fits_machine"] is True
            assert llama3["fits_machine"] is False

    @pytest.mark.asyncio
    async def test_recommendations_lists_other_installed_models(self):
        with patch.object(ollama_service, "is_ollama_reachable", return_value=True), patch.object(
            ollama_service, "list_installed_models", return_value=["llama3.2:3b", "qwen3.8:27b-mlx"]
        ), patch.object(ollama_service, "get_system_ram_gb", return_value=(36.0, "macos-sysctl")):
            data = await ollama_service.get_recommendations("llama3.2:3b", "llama3.2:3b")
            assert any(item["id"] == "qwen3.8:27b-mlx" for item in data["other_installed"])
            assert data["ram_detection"] == "macos-sysctl"

    @pytest.mark.asyncio
    async def test_validate_model_choice_accepts_installed(self):
        with patch.object(ollama_service, "is_ollama_reachable", return_value=True), patch.object(
            ollama_service, "list_installed_models", return_value=["qwen3.8:27b-mlx"]
        ):
            await ollama_service.validate_model_choice("qwen3.8:27b-mlx")
