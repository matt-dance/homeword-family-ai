FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir hatchling

COPY gateway/pyproject.toml gateway/
COPY gateway/homeward_gateway gateway/homeward_gateway
COPY policies /app/policies

RUN pip install --no-cache-dir ./gateway

ENV HOMEWARD_POLICIES_DIR=/app/policies
ENV HOMEWARD_DATA_DIR=/data

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "homeward_gateway.main:app", "--host", "0.0.0.0", "--port", "8000"]
