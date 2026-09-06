"""HOMEWARD_MANAGED vs HOMEWARD_DOCKER."""

from unittest.mock import patch

import pytest

from homeward_gateway.config import settings
from homeward_gateway.ollama import service as ollama_service


def _restore(managed: bool, docker_mode: bool) -> None:
    settings.managed = managed
    settings.docker_mode = docker_mode


class TestIsOllamaManaged:
    def test_false_by_default(self):
        original = (settings.managed, settings.docker_mode)
        try:
            settings.managed = False
            settings.docker_mode = False
            assert settings.is_ollama_managed() is False
        finally:
            _restore(*original)

    def test_true_when_managed_only(self):
        original = (settings.managed, settings.docker_mode)
        try:
            settings.managed = True
            settings.docker_mode = False
            assert settings.is_ollama_managed() is True
        finally:
            _restore(*original)

    def test_true_when_docker_only(self):
        original = (settings.managed, settings.docker_mode)
        try:
            settings.managed = False
            settings.docker_mode = True
            assert settings.is_ollama_managed() is True
        finally:
            _restore(*original)


class TestGetStatusManaged:
    @pytest.mark.asyncio
    async def test_managed_true_when_native_flag_set(self):
        original = (settings.managed, settings.docker_mode)
        try:
            settings.managed = True
            settings.docker_mode = False
            with patch.object(ollama_service, "is_ollama_reachable", return_value=True), patch.object(
                ollama_service, "list_installed_models", return_value=[]
            ):
                status = await ollama_service.get_status("llama3.2:3b", "llama3.2:3b")
            assert status["managed"] is True
            assert status["bootstrap_hint"] is not None
        finally:
            _restore(*original)

    @pytest.mark.asyncio
    async def test_managed_false_when_neither_flag(self):
        original = (settings.managed, settings.docker_mode)
        try:
            settings.managed = False
            settings.docker_mode = False
            with patch.object(ollama_service, "is_ollama_reachable", return_value=True), patch.object(
                ollama_service, "list_installed_models", return_value=["llama3.2:3b"]
            ):
                status = await ollama_service.get_status("llama3.2:3b", "llama3.2:3b")
            assert status["managed"] is False
            assert status["bootstrap_hint"] is None
        finally:
            _restore(*original)


class TestUnavailableDetail:
    def test_managed_copy(self):
        original = (settings.managed, settings.docker_mode)
        try:
            settings.managed = True
            settings.docker_mode = False
            text = ollama_service.ollama_unavailable_detail()
            assert "ollama.com" not in text.lower()
            assert "ollama serve" not in text
            assert "starting" in text.lower()
        finally:
            _restore(*original)

    def test_unmanaged_copy_keeps_cli_hint(self):
        original = (settings.managed, settings.docker_mode)
        try:
            settings.managed = False
            settings.docker_mode = False
            text = ollama_service.ollama_unavailable_detail()
            assert "ollama serve" in text
        finally:
            _restore(*original)
