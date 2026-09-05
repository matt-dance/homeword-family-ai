import asyncio

import pytest

from homeward_gateway.api.sse import SSE_KEEPALIVE, with_sse_heartbeats


@pytest.mark.asyncio
async def test_heartbeats_while_source_is_quiet():
    async def slow_source():
        await asyncio.sleep(0.05)
        yield 'data: {"type":"token","content":"Hi"}\n\n'

    chunks = [chunk async for chunk in with_sse_heartbeats(slow_source(), interval=0.01)]
    assert any(chunk == SSE_KEEPALIVE for chunk in chunks)
    assert any("Hi" in chunk for chunk in chunks)


@pytest.mark.asyncio
async def test_heartbeats_propagate_source_errors():
    async def boom():
        yield "data: 1\n\n"
        raise RuntimeError("llm down")
        yield "data: 2\n\n"  # pragma: no cover

    with pytest.raises(RuntimeError, match="llm down"):
        async for _chunk in with_sse_heartbeats(boom(), interval=0.01):
            pass
