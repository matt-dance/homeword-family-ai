"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from homeward_gateway.api.routes import router
from homeward_gateway.config import settings
from homeward_gateway.db.database import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
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
    yield


app = FastAPI(
    title="Homeward Gateway",
    description="Family AI safety gateway — local-first, privacy-focused",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


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
