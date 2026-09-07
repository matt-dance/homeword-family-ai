import asyncio

import pytest

from homeward_gateway.api.sse import SSE_CONNECTED, SSE_KEEPALIVE, with_sse_heartbeats


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


@pytest.mark.asyncio
async def test_heartbeat_teardown_does_not_wait_on_a_stuck_source():
    started = asyncio.get_running_loop().time()

    async def stuck():
        await asyncio.sleep(30)
        yield "never"

    agen = with_sse_heartbeats(stuck(), interval=0.01)
    chunk = await anext(agen)
    assert chunk == SSE_KEEPALIVE
    await asyncio.wait_for(agen.aclose(), timeout=1.0)
    assert asyncio.get_running_loop().time() - started < 2.0


def test_connected_preamble_is_an_sse_comment():
    assert SSE_CONNECTED.startswith(": ")
    assert SSE_CONNECTED.endswith("\n\n")
