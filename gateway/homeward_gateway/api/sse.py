"""Server-sent event helpers for kid chat streaming."""

from __future__ import annotations

import asyncio
import contextlib
from typing import AsyncIterator

SSE_HEARTBEAT_SECONDS = 8.0
SSE_KEEPALIVE = ": keepalive\n\n"


async def with_sse_heartbeats(
    source: AsyncIterator[str],
    *,
    interval: float | None = None,
) -> AsyncIterator[str]:
    """Forward SSE chunks and emit comment keepalives while the source is quiet.

    Next.js proxies and the kid-chat client treat any received bytes as activity.
    llama3.2:3b can sit silent for tens of seconds before the first token; comments
    keep the browser from idle-timing-out a stream that is still working.
    """
    period = SSE_HEARTBEAT_SECONDS if interval is None else interval
    queue: asyncio.Queue[tuple[str, object]] = asyncio.Queue()

    async def pump() -> None:
        try:
            async for chunk in source:
                await queue.put(("data", chunk))
        except Exception as exc:
            await queue.put(("error", exc))
        else:
            await queue.put(("done", None))

    task = asyncio.create_task(pump())
    try:
        while True:
            try:
                kind, payload = await asyncio.wait_for(queue.get(), timeout=period)
            except asyncio.TimeoutError:
                yield SSE_KEEPALIVE
                continue
            if kind == "data":
                yield str(payload)
            elif kind == "error":
                raise payload  # type: ignore[misc]
            else:
                break
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
