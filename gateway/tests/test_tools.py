from homeward_gateway.chat.tools import (
    apply_card_routing,
    ask_parent_card,
    card_route_for_message,
    clock_tool_hint,
    convert_units,
    current_clock_card,
    detect_intents,
    evaluate_math,
    extract_model_tools,
    howto_from_prose,
    is_clock_question,
    is_self_contained_card_request,
    local_howto_card,
    local_practice_card,
    local_quiz_card,
    normalize_howto_data,
    parse_timer_seconds,
    requested_story_pages,
    run_local_tools,
    tool_prompt_hint,
    ToolCard,
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


def test_timer_prefix_and_hyphenated_seconds():
    assert parse_timer_seconds("Set a 10-second timer") == 10
    assert parse_timer_seconds("10 second timer") == 10
    assert parse_timer_seconds("Start a 10 second countdown") == 10
    assert parse_timer_seconds("Can you set a 15-second timer?") == 15


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
    assert "howto" in detect_intents("How do you make pancakes?")
    assert "howto" in detect_intents("Show me how to tie my shoes")
    assert "howto" in detect_intents("Recipe for slime")
    assert "quiz" in detect_intents("Quiz me on that")
    assert "ask_parent" in detect_intents("Ask my parent if I can stay up late")
    assert "ask_parent" in detect_intents("Can you ask my mom about this?")
    assert "ask_parent" in detect_intents("I need a grown-up")


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
    timer = run_local_tools("Set a 10-second timer")
    assert any(card.type == "timer" and card.data["seconds"] == 10 for card in timer)


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
    cup = run_local_tools("How many mL in 1 cup?")
    assert any(card.type == "convert" for card in cup)
    assert not any(card.type == "howto" for card in cup)


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


def test_tool_prompt_hint_timer_does_not_offer_quiz_menu():
    hint = tool_prompt_hint(["timer"], local_types={"timer"})
    assert "timer" in hint.lower()
    assert "quiz" not in hint.lower() or "do not emit a quiz" in hint.lower()
    assert '{"type":"..."}' not in hint


def test_requested_story_pages():
    assert requested_story_pages("Tell me a 2 page story about a fox") == 2
    assert requested_story_pages("a two-page story please") == 2
    assert requested_story_pages("Tell me a short story about a fox") is None


def test_card_route_and_apply_routing_drops_wrong_type():
    route = card_route_for_message("Set a 10-second timer")
    assert route["allow"] is not None
    assert "timer" in route["allow"]
    assert "quiz" not in route["allow"]

    quiz = ToolCard("quiz", {"title": "Animal Quiz Time!", "questions": []})
    timer = ToolCard("timer", {"seconds": 10, "label": "10 seconds"})
    kept = apply_card_routing("Set a 10-second timer", [quiz, timer])
    assert [card.type for card in kept] == ["timer"]

    story = ToolCard(
        "story",
        {"title": "Fox", "pages": [{"text": "1"}, {"text": "2"}, {"text": "3"}]},
    )
    trimmed = apply_card_routing("Tell me a 2 page story about a fox", [story])
    assert trimmed[0].type == "story"
    assert len(trimmed[0].data["pages"]) == 2

    howto_route = card_route_for_message("How do I make pancakes?")
    assert howto_route["allow"] is not None
    assert "howto" in howto_route["allow"]
    assert apply_card_routing("How do I make pancakes?", [story]) == []


def test_local_quiz_and_practice_and_ask_parent_cards():
    quiz = local_quiz_card("Quiz me about animals!")
    assert quiz is not None
    assert quiz.type == "quiz"
    assert quiz.data["title"]
    assert len(quiz.data["questions"]) >= 3
    assert local_quiz_card("Quiz me on that") is None

    practice = local_practice_card("Practice times tables")
    assert practice is not None
    assert practice.type == "practice"
    assert practice.data["kind"] == "times"

    cards = run_local_tools("Ask my parent if I can stay up")
    assert any(card.type == "ask_parent" for card in cards)


def test_local_howto_card_for_pancake_prompt():
    card = local_howto_card("How do I make pancakes?")
    assert card is not None
    assert card.type == "howto"
    assert "pancake" in card.data["title"].lower()
    assert len(card.data["steps"]) >= 3
    assert all(isinstance(step, str) and step for step in card.data["steps"])

    cards = run_local_tools("How do I make pancakes?")
    howto = next(card for card in cards if card.type == "howto")
    assert howto.data["steps"]

    slime = local_howto_card("Recipe for slime")
    assert slime is not None
    assert "slime" in slime.data["title"].lower()

    shoes = local_howto_card("Show me how to tie my shoes")
    assert shoes is not None
    assert any("loop" in step.lower() or "lace" in step.lower() for step in shoes.data["steps"])

    generic = local_howto_card("How do I fold a paper crane?")
    assert generic is not None
    assert generic.type == "howto"
    assert len(generic.data["steps"]) >= 2

    assert local_howto_card("Set a 10-second timer") is None
    assert local_howto_card("How many mL in 1 cup?") is None


def test_normalize_howto_accepts_nested_step_objects():
    normalized = normalize_howto_data(
        {
            "title": "Pancakes",
            "steps": [
                {"step": 1, "text": "Mix the batter"},
                {"instruction": "Heat the pan"},
            ],
        }
    )
    assert normalized == {"title": "Pancakes", "steps": ["Mix the batter", "Heat the pan"]}


def test_extract_model_tools_nested_howto_fence():
    text = (
        "Here you go.\n"
        "```homeward\n"
        "{\n"
        '  "type": "howto",\n'
        '  "title": "Pancakes",\n'
        '  "steps": [{"text": "Mix flour"}, {"text": "Cook gently"}]\n'
        "}\n"
        "```\n"
    )
    cleaned, cards = extract_model_tools(text)
    assert "homeward" not in cleaned
    assert cards[0].type == "howto"
    assert cards[0].data["steps"] == ["Mix flour", "Cook gently"]


def test_howto_from_prose_numbered_recipe():
    prose = (
        "Sure! Here is a pancake recipe:\n"
        "1. Mix flour and milk\n"
        "2. Heat the pan\n"
        "3. Flip when bubbly\n"
    )
    card = howto_from_prose(prose, title="Make pancakes")
    assert card is not None
    assert card.type == "howto"
    assert card.data["steps"] == ["Mix flour and milk", "Heat the pan", "Flip when bubbly"]


def test_tool_prompt_hint_local_howto_does_not_ask_for_fence():
    hint = tool_prompt_hint(["howto"], local_types={"howto"})
    assert "how-to card will already appear" in hint.lower()
    assert '{"type":"..."}' not in hint
    assert "numbered recipe" in hint.lower()


def test_self_contained_card_request():
    assert is_self_contained_card_request("Set a 10-second timer")
    assert is_self_contained_card_request("How do I make pancakes?")
    assert is_self_contained_card_request("Quiz me about animals!")
    assert not is_self_contained_card_request("Quiz me on that")
    assert not is_self_contained_card_request("why is the sky blue")
