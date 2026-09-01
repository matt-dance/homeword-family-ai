"""Application configuration."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HOMEWARD_", env_file=".env", extra="ignore")

    # Paths
    data_dir: Path = Path("./data")
    policies_dir: Path = Path(__file__).parent.parent.parent / "policies"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    secret_key: str = "change-me-in-production"
    session_cookie_name: str = "homeward_session"
    session_max_age: int = 86400 * 7

    # Ollama / LLM
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"
    classifier_model: str = "llama3.2:3b"
    classifier_timeout: float = 10.0
    llm_timeout: float = 60.0
    cloud_enabled: bool = False
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # Packaging
    docker_mode: bool = False

    # Database
    database_url: str = "sqlite+aiosqlite:///./homeward.db"

    def resolved_db_url(self) -> str:
        if self.database_url.startswith("sqlite"):
            db_path = self.data_dir / "homeward.db"
            return f"sqlite+aiosqlite:///{db_path}"
        return self.database_url


settings = Settings()
