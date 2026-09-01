"""Tests for response trimming helpers."""

from homeward_gateway.models.response_limits import chars_to_max_tokens, trim_response


def test_chars_to_max_tokens_scales_with_limit():
    assert chars_to_max_tokens(800) >= 256
    assert chars_to_max_tokens(500) >= 256


def test_trim_response_keeps_short_text():
    text = "Hello there!"
    assert trim_response(text, 100) == text


def test_trim_response_prefers_sentence_boundary():
    text = "Stars are bright. The Big Dipper is a famous pattern. More facts follow here."
    trimmed = trim_response(text, 55)
    assert trimmed.endswith(".")
    assert "Big Dipper" in trimmed
