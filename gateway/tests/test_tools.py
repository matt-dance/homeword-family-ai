from homeward_gateway.chat.tools import (
    detect_intents,
    evaluate_math,
    extract_model_tools,
    parse_timer_seconds,
    run_local_tools,
)


def test_evaluate_math_basic():
    result = evaluate_math("12 * 8")
    assert result["result"] == "96"
    assert result["steps"] == ["12 × 8 = 96"]


def test_evaluate_math_order_of_operations():
    result = evaluate_math("2 + 3 * 4")
    assert result["result"] == "14"
    assert result["steps"] == ["3 × 4 = 12", "2 + 12 = 14"]


def test_evaluate_math_rejects_names():
    try:
        evaluate_math("__import__('os')")
    except ValueError:
        return
    raise AssertionError("should reject names")


def test_timer_minutes():
    assert parse_timer_seconds("Set a timer for 2 minutes") == 120
    assert parse_timer_seconds("Remind me in 10 minutes") == 600


def test_detect_intents():
    assert "math" in detect_intents("What is 6 + 7?")
    assert "define" in detect_intents("What does photosynthesis mean?")
    assert "quiz" in detect_intents("Quiz me about planets")
    assert "facts" in detect_intents("3 facts about dogs")
    assert "timer" in detect_intents("Set a timer for 30 seconds")


def test_run_local_math_and_timer():
    cards = run_local_tools("What is 5+3?")
    assert any(card.type == "math" and card.data["result"] == "8" for card in cards)


def test_extract_model_tools():
    text = 'Here you go.\n\n```homeward\n{"type":"facts","topic":"dogs","facts":["They sniff.","They run."]}\n```\n'
    cleaned, cards = extract_model_tools(text)
    assert "homeward" not in cleaned
    assert cards[0].type == "facts"
    assert cards[0].data["topic"] == "dogs"
