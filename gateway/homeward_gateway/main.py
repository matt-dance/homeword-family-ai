"""FastAPI application entry point."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from homeward_gateway.api.homework_routes import router as homework_router
from homeward_gateway.api.routes import router
from homeward_gateway.config import settings
from homeward_gateway.db.database import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _warn_if_lan_exposed() -> None:
    if settings.host in {"0.0.0.0", "::", "[::]"} and not settings.docker_mode:
        logger.warning(
            "Gateway is listening on %s — devices on the Wi‑Fi can reach the API "
            "directly. Bind to 127.0.0.1 so only this computer and the web app can.",
            settings.host,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    settings.resolved_secret_key()  # create the per-install signing key up front
    from homeward_gateway.db.database import hash_legacy_child_pins

    upgraded = await hash_legacy_child_pins()
    if upgraded:
        logger.info("Hashed %s legacy plaintext child PIN(s)", upgraded)
    _warn_if_lan_exposed()
    logger.info("Homeward gateway started on %s:%s", settings.host, settings.port)
    from homeward_gateway.ollama import service as ollama_service

    if await ollama_service.is_ollama_reachable():
        models = await ollama_service.list_installed_models()
        logger.info("Ollama reachable at %s — models: %s", settings.ollama_base_url, models or "none")
    else:
        logger.warning(
            "Ollama not reachable at %s — install from https://ollama.com and run: ollama serve",
            settings.ollama_base_url,
        )

    from homeward_gateway.voice.transcribe import whisper_available

    if whisper_available():
        asyncio.create_task(asyncio.to_thread(_preload_whisper))

    from homeward_gateway.network import mdns as mdns_service

    if settings.mdns_enabled and not settings.docker_mode:
        try:
            await asyncio.to_thread(mdns_service.start, settings.mdns_hostname, settings.web_port)
        except Exception as exc:
            logger.warning("mDNS failed to start (homeward.local may not resolve on LAN): %s", exc)

    yield

    if settings.mdns_enabled and not settings.docker_mode:
        await asyncio.to_thread(mdns_service.stop)


def _preload_whisper() -> None:
    from homeward_gateway.voice.transcribe import ensure_model, whisper_available as _whisper_ok

    if not _whisper_ok():
        return
    try:
        ensure_model()
    except Exception as exc:
        logger.warning("Whisper preload skipped: %s", exc)


app = FastAPI(
    title="Homeward Gateway",
    description="Family AI safety gateway — local-first, privacy-focused",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.api_docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.api_docs else None,
)

# The web app proxies /api/v1 same-origin, so browsers never need CORS. Only
# the local hostnames are allowed for direct dev access; wildcard + credentials
# would let any page on the LAN ride the parent session cookie.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\]|homeward\.local)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(homework_router, prefix="/api/v1")


def main():
    import uvicorn
    uvicorn.run(
        "homeward_gateway.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
