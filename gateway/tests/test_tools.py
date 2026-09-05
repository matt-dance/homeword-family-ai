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
    is_clock_question,
    is_self_contained_card_request,
    local_card_cheer,
    local_practice_card,
    local_quiz_card,
    messages_for_llm,
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


def test_self_contained_card_request():
    assert is_self_contained_card_request("Set a 10-second timer")
    assert is_self_contained_card_request("How do I make pancakes?")
    assert is_self_contained_card_request("Quiz me about animals!")
    assert not is_self_contained_card_request("Quiz me on that")
    assert not is_self_contained_card_request("why is the sky blue")


def test_local_card_cheer_for_self_contained_local_cards():
    timer = local_card_cheer("Set a 10-second timer")
    assert timer is not None
    assert "timer" in timer.lower()
    assert "animal" not in timer.lower()
    assert "quiz" not in timer.lower()

    quiz = local_card_cheer("Quiz me about animals!")
    assert quiz is not None
    assert "card" in quiz.lower()

    practice = local_card_cheer("Practice times tables")
    assert practice is not None

    parent = local_card_cheer("Ask my parent if I can stay up late")
    assert parent is not None
    assert "grown-up" in parent.lower()

    # Model still has to write the card / explanation.
    assert local_card_cheer("How do I make pancakes?") is None
    assert local_card_cheer("Quiz me about dinosaurs!") is None
    assert local_card_cheer("why is the sky blue") is None


def test_messages_for_llm_omits_history_on_card_turns():
    history = [
        {"role": "user", "content": "Quiz me about animals!"},
        {
            "role": "assistant",
            "content": "Think of an animal that has a long neck and spots.",
        },
    ]
    timer_msgs = messages_for_llm(history, "Set a 10-second timer", "Set a 10-second timer")
    blob = " ".join(item["content"] for item in timer_msgs)
    assert "animal" not in blob.lower()
    assert "spots" not in blob.lower()
    assert timer_msgs == [{"role": "user", "content": "Set a 10-second timer"}]

    howto_msgs = messages_for_llm(
        [{"role": "user", "content": "Tell me a story about a curious fox"}],
        "How do I make pancakes?",
        "How do I make pancakes?",
    )
    assert "fox" not in " ".join(item["content"] for item in howto_msgs).lower()

    follow_up = messages_for_llm(history, "why is that?", "why is that?")
    assert follow_up[0]["content"] == "Quiz me about animals!"
    assert follow_up[-1]["content"] == "why is that?"
