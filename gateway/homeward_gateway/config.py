"""Application configuration."""

import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET_KEY = "change-me-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HOMEWARD_", env_file=".env", extra="ignore")

    # Paths
    data_dir: Path = Path("./data")
    policies_dir: Path = Path(__file__).parent.parent.parent / "policies"

    # Server — bind loopback by default so LAN devices cannot skip the web proxy.
    # Docker overrides this to 0.0.0.0 inside the container (port is host-only).
    host: str = "127.0.0.1"
    port: int = 8000
    web_port: int = 80
    mdns_enabled: bool = True
    mdns_hostname: str = "homeward.local"
    api_docs: bool = False
    secret_key: str = DEFAULT_SECRET_KEY
    session_cookie_name: str = "homeward_session"
    session_max_age: int = 86400 * 7
    child_access_max_age: int = 86400  # one PIN unlock per device per day

    # Ollama / LLM
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:3b"
    classifier_model: str = "llama3.2:3b"
    classifier_timeout: float = 5.0
    llm_timeout: float = 60.0
    llm_first_token_timeout: float = 25.0
    lookup_timeout: float = 8.0
    cloud_enabled: bool = False
    openai_api_key: str = ""

    # Packaging
    docker_mode: bool = False

    # Local voice (Whisper + Piper TTS)
    whisper_model: str = "tiny.en"
    whisper_max_bytes: int = 5_000_000
    piper_voice: str = "en_US-lessac-medium"
    speak_max_chars: int = 4_000

    # Database
    database_url: str = "sqlite+aiosqlite:///./homeward.db"

    def resolved_db_url(self) -> str:
        if self.database_url.startswith("sqlite"):
            db_path = self.data_dir / "homeward.db"
            return f"sqlite+aiosqlite:///{db_path}"
        return self.database_url

    def resolved_secret_key(self) -> str:
        """Use the configured key, or a per-install random key persisted in data_dir.

        Families never set HOMEWARD_SECRET_KEY, so the default must not be a
        well-known string that lets anyone forge a parent session cookie.
        """
        if self.secret_key and self.secret_key != DEFAULT_SECRET_KEY:
            return self.secret_key
        key_file = self.data_dir / ".secret_key"
        try:
            existing = key_file.read_text().strip()
            if len(existing) >= 32:
                return existing
        except OSError:
            pass
        generated = secrets.token_hex(32)
        try:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            key_file.write_text(generated)
            key_file.chmod(0o600)
        except OSError:
            # Read-only data dir: sessions will only survive this process.
            pass
        return generated


settings = Settings()
