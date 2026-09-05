from homeward_gateway.chat.tools import (
    ask_parent_card,
    clock_tool_hint,
    convert_units,
    current_clock_card,
    detect_intents,
    evaluate_math,
    extract_model_tools,
    is_clock_question,
    parse_timer_seconds,
    run_local_tools,
    tool_prompt_hint,
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
    assert "clock" in detect_intents("What time is it?")
    assert "story" in detect_intents("Tell me a short story about dragons")
    assert "riddle" in detect_intents("Give me a riddle")
    assert "riddle" in detect_intents("Let's play 20 questions")
    assert "convert" in detect_intents("How many inches in 5 feet?")
    assert "practice" in detect_intents("Practice times tables")
    assert "practice" in detect_intents("Practice spelling words")
    assert "howto" in detect_intents("How do I make pancakes?")
    assert "howto" in detect_intents("Recipe for slime")
    assert "quiz" in detect_intents("Quiz me on that")


def test_clock_not_confused_with_timer():
    assert "clock" not in detect_intents("Set a timer for 2 minutes")
    assert is_clock_question("What time is it?")


def test_run_local_clock():
    cards = run_local_tools("What time is it?")
    assert any(card.type == "clock" and card.data["time"] for card in cards)


def test_clock_tool_hint_includes_actual_time():
    hint = clock_tool_hint("What time is it?")
    assert "Time:" in hint
    assert "Date:" in hint
    assert any(ch.isdigit() for ch in hint)


def test_run_local_math_and_timer():
    cards = run_local_tools("What is 5+3?")
    assert any(card.type == "math" and card.data["result"] == "8" for card in cards)


def test_extract_model_tools():
    text = 'Here you go.\n\n```homeward\n{"type":"facts","topic":"dogs","facts":["They sniff.","They run."]}\n```\n'
    cleaned, cards = extract_model_tools(text)
    assert "homeward" not in cleaned
    assert cards[0].type == "facts"
    assert cards[0].data["topic"] == "dogs"


def test_extract_model_tools_lookup():
    text = (
        '```homeward\n{"type":"lookup","kind":"weather","source":"open-meteo",'
        '"source_label":"Open-Meteo weather","query":"Denver","summary":"70F"}\n```'
    )
    cleaned, cards = extract_model_tools(text)
    assert cards[0].type == "lookup"
    assert cards[0].data["source"] == "open-meteo"
    assert "homeward" not in cleaned


def test_extract_model_tools_lookup_request():
    text = (
        '```homeward\n{"type":"lookup_request","kind":"sports",'
        '"query":"University of Utah football"}\n```'
    )
    cleaned, cards = extract_model_tools(text)
    assert cards[0].type == "lookup_request"
    assert cards[0].data["kind"] == "sports"
    assert cards[0].data["query"] == "University of Utah football"
    assert "homeward" not in cleaned


def test_extract_model_tools_story_riddle_practice_howto():
    text = (
        '```homeward\n{"type":"story","title":"Moon hike",'
        '"pages":[{"text":"You land.","choices":[{"label":"Wave","message":"I wave."}]}]}\n```\n'
        '```homeward\n{"type":"riddle","riddle":"What has hands but no arms?","answer":"A clock"}\n```\n'
        '```homeward\n{"type":"practice","title":"Twos","kind":"times",'
        '"items":[{"prompt":"2 × 3","answer":"6"}]}\n```\n'
        '```homeward\n{"type":"howto","title":"Toast","steps":["Get bread","Toast it"]}\n```'
    )
    cleaned, cards = extract_model_tools(text)
    assert [card.type for card in cards] == ["story", "riddle", "practice", "howto"]
    assert cards[0].data["pages"][0]["text"] == "You land."
    assert "homeward" not in cleaned


def test_convert_how_many_x_in_y():
    result = convert_units("How many inches in 5 feet?")
    assert result is not None
    assert result["from_amount"] == "5"
    assert result["from_unit"] == "feet"
    assert result["to_unit"] == "inches"
    assert result["result"] == "60"


def test_convert_how_many_in_a_unit():
    result = convert_units("How many cups in a gallon?")
    assert result is not None
    assert result["from_amount"] == "1"
    assert float(result["result"]) == 16


def test_convert_explicit_to():
    result = convert_units("Convert 10 miles to km")
    assert result is not None
    assert result["from_unit"] == "miles"
    assert result["to_unit"] == "km"
    assert abs(float(result["result"]) - 16.0934) < 0.02


def test_convert_celsius_to_fahrenheit():
    result = convert_units("Convert 0 celsius to fahrenheit")
    assert result is not None
    assert result["result"] == "32"


def test_convert_rejects_unknown_or_mismatch():
    assert convert_units("How many inches in 5 minutes?") is None
    assert convert_units("What time is it?") is None


def test_run_local_convert():
    cards = run_local_tools("How many cm in 2 meters?")
    assert any(card.type == "convert" and card.data["result"] == "200" for card in cards)


def test_ask_parent_card_is_friendly():
    card = ask_parent_card()
    assert card.type == "ask_parent"
    assert card.data["title"]
    assert card.data["message"]


def test_tool_prompt_hint_covers_new_cards():
    hint = tool_prompt_hint(["story", "quiz", "riddle", "practice", "howto", "convert"])
    assert "story" in hint
    assert "pages" in hint
    assert "quiz" in hint
    assert "riddle" in hint
    assert "practice" in hint
    assert "howto" in hint
    assert "convert" in hint or "conversion" in hint.lower()
