"""HOMEWARD_MANAGED vs HOMEWARD_DOCKER."""

from homeward_gateway.config import settings


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
