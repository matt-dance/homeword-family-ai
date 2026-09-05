"""Local kid-chat tools: math, timer, plus structured cards from the model."""

from __future__ import annotations

import ast
import json
import operator
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

TOOL_FENCE = "homeward"

_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}
_OP_SYMBOLS = {
    ast.Add: "+",
    ast.Sub: "-",
    ast.Mult: "×",
    ast.Div: "÷",
    ast.FloorDiv: "//",
    ast.Mod: "%",
    ast.Pow: "^",
}

_TIMER_AFTER_RE = re.compile(
    r"\b(?:set\s+(?:a\s+)?timer|timer|remind\s+me|countdown)\b.*?\b(\d+(?:\.\d+)?)\s*"
    r"(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b",
    re.IGNORECASE,
)
_TIMER_BEFORE_RE = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*[- ]?(seconds?|secs?|minutes?|mins?|hours?|hrs?)\s+"
    r"(?:long\s+)?(?:timer|countdown|remind(?:er)?)\b",
    re.IGNORECASE,
)
_TIMER_SET_PREFIX_RE = re.compile(
    r"\b(?:set|start|begin|make)\s+(?:me\s+)?(?:a\s+|an\s+)?"
    r"(\d+(?:\.\d+)?)\s*[- ]?(seconds?|secs?|minutes?|mins?|hours?|hrs?)\s+"
    r"(?:timer|countdown)\b",
    re.IGNORECASE,
)
_TIMER_IN_RE = re.compile(
    r"\bin\s+(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b",
    re.IGNORECASE,
)
_MATH_ASK_RE = re.compile(
    r"(?:what(?:'s| is)|calculate|compute|solve|how much is)\s+(.+)$",
    re.IGNORECASE,
)
_EXPR_RE = re.compile(r"^[\d\s+\-*/().%^x×÷]+$")
_DEFINE_RE = re.compile(
    r"(?:what does|define|meaning of|what is the meaning of)\s+[\"']?([a-zA-Z][a-zA-Z\-']{1,40})[\"']?",
    re.IGNORECASE,
)
_QUIZ_RE = re.compile(r"\b(quiz|flash\s*cards?|test me|practice questions)\b", re.IGNORECASE)
_FACTS_RE = re.compile(r"\b(fun facts?|facts about|\d+\s+facts)\b", re.IGNORECASE)
_STORY_RE = re.compile(
    r"\b(?:tell me (?:a |an )?(?:short |fun |bedtime )?story|story about|"
    r"read me (?:a |an )?story|make up (?:a |an )?story|once upon a time)\b",
    re.IGNORECASE,
)
_RIDDLE_RE = re.compile(r"\b(?:riddles?|twenty questions|20 questions|i spy)\b", re.IGNORECASE)
_PRACTICE_RE = re.compile(
    r"\b(?:times\s*tables?|practice spelling|spelling (?:words|practice|list|quiz)|"
    r"multiplication (?:practice|tables)|practice (?:my )?(?:times|multiplication|spelling))\b",
    re.IGNORECASE,
)
_HOWTO_RE = re.compile(
    r"\b(?:"
    r"how\s+(?:do\s+i|do\s+you|can\s+i|can\s+you|to|should\s+i)\s+\w+"
    r"|show\s+me\s+how"
    r"|teach\s+me\s+how"
    r"|instructions\s+for"
    r"|recipe\s+for"
    r"|step[- ]by[- ]step"
    r"|howto\b"
    r")",
    re.IGNORECASE,
)
_ASK_PARENT_RE = re.compile(
    r"\b(?:"
    r"ask\s+(?:my\s+|a\s+)?(?:mom|dad|mummy|mommy|papa|mama|mother|father|parent|parents|grown-?up|adult)"
    r"|can\s+you\s+ask\s+(?:my\s+)?(?:mom|dad|parent|parents|grown-?up)"
    r"|i\s+need\s+(?:a\s+|my\s+)?(?:grown-?up|parent|adult|mom|dad)"
    r"|ask_parent"
    r")\b",
    re.IGNORECASE,
)
_STORY_PAGES_RE = re.compile(
    r"\b(\d+|one|two|three|four|five|six)\s*-?\s*pages?\b",
    re.IGNORECASE,
)
_QUIZ_TOPIC_RE = re.compile(
    r"(?:quiz|test)\s+me\s+(?:about|on|over)\s+(.+)",
    re.IGNORECASE,
)
_WORD_TO_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
_REFERENTIAL_QUIZ_TOPICS = {"that", "this", "it", "them", "those", "these"}
_CONVERT_HOW_MANY_RE = re.compile(
    r"\bhow many\s+([a-zA-Z]+)\s+(?:are\s+)?in\s+(?:an?\s+)?(?:(\d+(?:\.\d+)?)\s+)?([a-zA-Z]+)\b",
    re.IGNORECASE,
)
_CONVERT_TO_RE = re.compile(
    r"\bconvert\s+(\d+(?:\.\d+)?)\s+([a-zA-Z]+)\s+(?:to|into)\s+([a-zA-Z]+)\b",
    re.IGNORECASE,
)
_CONVERT_BARE_RE = re.compile(
    r"\b(\d+(?:\.\d+)?)\s+([a-zA-Z]+)\s+(?:to|in)\s+([a-zA-Z]+)\b",
    re.IGNORECASE,
)
_CLOCK_RE = re.compile(
    r"\b(?:what(?:'s| is) (?:the )?time(?:\s+is\s+it)?|what time is it|current time|"
    r"what(?:'s| is) (?:the )?date|what day is (?:it|today)|"
    r"what(?:'s| is) today(?:'?s date)?|day of the week)\b",
    re.IGNORECASE,
)
_FENCE_RE = re.compile(
    rf"```{TOOL_FENCE}\s*(\{{[\s\S]*?\}})\s*```",
    re.IGNORECASE,
)

MODEL_TOOL_TYPES = {
    "define",
    "quiz",
    "facts",
    "math",
    "timer",
    "lookup",
    "clock",
    "story",
    "riddle",
    "convert",
    "practice",
    "ask_parent",
    "howto",
}

_LENGTH_M = {
    "mm": 0.001,
    "millimeter": 0.001,
    "millimeters": 0.001,
    "cm": 0.01,
    "centimeter": 0.01,
    "centimeters": 0.01,
    "m": 1.0,
    "meter": 1.0,
    "meters": 1.0,
    "metre": 1.0,
    "metres": 1.0,
    "km": 1000.0,
    "kilometer": 1000.0,
    "kilometers": 1000.0,
    "kilometre": 1000.0,
    "kilometres": 1000.0,
    "in": 0.0254,
    "inch": 0.0254,
    "inches": 0.0254,
    "ft": 0.3048,
    "foot": 0.3048,
    "feet": 0.3048,
    "yd": 0.9144,
    "yard": 0.9144,
    "yards": 0.9144,
    "mi": 1609.344,
    "mile": 1609.344,
    "miles": 1609.344,
}
_MASS_KG = {
    "mg": 1e-6,
    "milligram": 1e-6,
    "milligrams": 1e-6,
    "g": 0.001,
    "gram": 0.001,
    "grams": 0.001,
    "kg": 1.0,
    "kilogram": 1.0,
    "kilograms": 1.0,
    "oz": 0.028349523125,
    "ounce": 0.028349523125,
    "ounces": 0.028349523125,
    "lb": 0.45359237,
    "lbs": 0.45359237,
    "pound": 0.45359237,
    "pounds": 0.45359237,
}
_VOLUME_L = {
    "ml": 0.001,
    "milliliter": 0.001,
    "milliliters": 0.001,
    "millilitre": 0.001,
    "millilitres": 0.001,
    "l": 1.0,
    "liter": 1.0,
    "liters": 1.0,
    "litre": 1.0,
    "litres": 1.0,
    "tsp": 0.00492892159375,
    "teaspoon": 0.00492892159375,
    "teaspoons": 0.00492892159375,
    "tbsp": 0.01478676478125,
    "tablespoon": 0.01478676478125,
    "tablespoons": 0.01478676478125,
    "cup": 0.2365882365,
    "cups": 0.2365882365,
    "pt": 0.473176473,
    "pint": 0.473176473,
    "pints": 0.473176473,
    "qt": 0.946352946,
    "quart": 0.946352946,
    "quarts": 0.946352946,
    "gal": 3.785411784,
    "gallon": 3.785411784,
    "gallons": 3.785411784,
}
_TIME_S = {
    "sec": 1.0,
    "secs": 1.0,
    "second": 1.0,
    "seconds": 1.0,
    "min": 60.0,
    "mins": 60.0,
    "minute": 60.0,
    "minutes": 60.0,
    "hr": 3600.0,
    "hrs": 3600.0,
    "hour": 3600.0,
    "hours": 3600.0,
    "day": 86400.0,
    "days": 86400.0,
    "week": 604800.0,
    "weeks": 604800.0,
}
_TEMP_UNITS = {
    "c": "c",
    "celsius": "c",
    "centigrade": "c",
    "f": "f",
    "fahrenheit": "f",
    "k": "k",
    "kelvin": "k",
}
_UNIT_GROUPS = (
    ("length", _LENGTH_M),
    ("mass", _MASS_KG),
    ("volume", _VOLUME_L),
    ("time", _TIME_S),
)


@dataclass(frozen=True)
class ToolCard:
    type: str
    data: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {"type": self.type, **self.data}


def _pretty_number(value: float) -> str:
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return f"{value:.4f}".rstrip("0").rstrip(".")


def _eval_node(node: ast.AST) -> tuple[float, list[str]]:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value), []
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        value, steps = _eval_node(node.operand)
        return _OPS[type(node.op)](value), steps
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        left, left_steps = _eval_node(node.left)
        right, right_steps = _eval_node(node.right)
        if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)) and right == 0:
            raise ZeroDivisionError("division by zero")
        result = _OPS[type(node.op)](left, right)
        symbol = _OP_SYMBOLS.get(type(node.op), "?")
        step = f"{_pretty_number(left)} {symbol} {_pretty_number(right)} = {_pretty_number(result)}"
        return result, [*left_steps, *right_steps, step]
    raise ValueError("unsupported expression")


def evaluate_math(expression: str) -> dict[str, Any]:
    cleaned = (
        expression.strip().rstrip("?.!")
        .replace("×", "*")
        .replace("÷", "/")
        .replace("x", "*")
        .replace("X", "*")
        .replace("^", "**")
    )
    cleaned = re.sub(r"[^0-9+\-*/().%\s]", "", cleaned)
    if not cleaned or not re.search(r"\d", cleaned):
        raise ValueError("no expression")
    tree = ast.parse(cleaned, mode="eval")
    result, steps = _eval_node(tree)
    pretty = _pretty_number(result)
    if not steps:
        steps = [f"{cleaned.replace('**', '^')} = {pretty}"]
    return {"expression": cleaned.replace("**", "^"), "result": pretty, "steps": steps}


def parse_timer_seconds(text: str) -> int | None:
    match = (
        _TIMER_SET_PREFIX_RE.search(text)
        or _TIMER_BEFORE_RE.search(text)
        or _TIMER_AFTER_RE.search(text)
        or _TIMER_IN_RE.search(text)
    )
    if not match:
        return None
    amount = float(match.group(1))
    unit = match.group(2).lower()
    if unit.startswith("hour") or unit.startswith("hr"):
        seconds = amount * 3600
    elif unit.startswith("min"):
        seconds = amount * 60
    else:
        seconds = amount
    if seconds < 1 or seconds > 24 * 3600:
        return None
    return int(round(seconds))


def format_duration(seconds: int) -> str:
    if seconds >= 3600:
        hours = seconds // 3600
        mins = (seconds % 3600) // 60
        return f"{hours} hour{'' if hours == 1 else 's'}" + (f" {mins} min" if mins else "")
    if seconds >= 60:
        mins = seconds // 60
        secs = seconds % 60
        return f"{mins} minute{'' if mins == 1 else 's'}" + (f" {secs} sec" if secs else "")
    return f"{seconds} second{'' if seconds == 1 else 's'}"


def is_clock_question(message: str) -> bool:
    if parse_timer_seconds(message):
        return False
    return bool(_CLOCK_RE.search(message or ""))


def format_local_time(now: datetime) -> str:
    text = now.strftime("%I:%M %p")
    if text.startswith("0"):
        text = text[1:]
    return text


def current_clock_card(now: datetime | None = None, timezone: str | None = None) -> ToolCard:
    moment = now
    if moment is None:
        if timezone:
            try:
                from zoneinfo import ZoneInfo

                moment = datetime.now(ZoneInfo(timezone))
            except Exception:
                moment = datetime.now().astimezone()
        else:
            moment = datetime.now().astimezone()
    tz = moment.tzname() or timezone or "local time"
    return ToolCard(
        "clock",
        {
            "time": format_local_time(moment),
            "date": moment.strftime("%A, %B %d, %Y"),
            "timezone": tz,
        },
    )


def clock_tool_hint(message: str, timezone: str | None = None) -> str:
    if not is_clock_question(message):
        return ""
    card = current_clock_card(timezone=timezone)
    return (
        "CURRENT LOCAL TIME from this device — not a guess. "
        f"Time: {card.data['time']}. Date: {card.data['date']} ({card.data['timezone']}). "
        "Use these exact values in your reply. Never use placeholders like [insert current time]."
    )


def detect_intents(message: str) -> list[str]:
    intents: list[str] = []
    if parse_timer_seconds(message):
        intents.append("timer")
    if _extract_math_expression(message):
        intents.append("math")
    if _DEFINE_RE.search(message):
        intents.append("define")
    if _QUIZ_RE.search(message):
        intents.append("quiz")
    if _FACTS_RE.search(message):
        intents.append("facts")
    if is_clock_question(message):
        intents.append("clock")
    if _STORY_RE.search(message):
        intents.append("story")
    if _RIDDLE_RE.search(message):
        intents.append("riddle")
    if convert_units(message):
        intents.append("convert")
    if _PRACTICE_RE.search(message):
        intents.append("practice")
    if _HOWTO_RE.search(message):
        intents.append("howto")
    if _ASK_PARENT_RE.search(message):
        intents.append("ask_parent")
    return intents


def requested_story_pages(message: str) -> int | None:
    match = _STORY_PAGES_RE.search(message or "")
    if not match:
        return None
    raw = match.group(1).lower()
    count = int(raw) if raw.isdigit() else _WORD_TO_NUM.get(raw)
    if count is None or count < 1 or count > 8:
        return None
    return count


def quiz_topic(message: str) -> str | None:
    match = _QUIZ_TOPIC_RE.search((message or "").strip().rstrip(".!?"))
    if not match:
        return None
    topic = re.sub(r"\s+", " ", match.group(1)).strip().rstrip(".!?")
    if not topic or topic.lower() in _REFERENTIAL_QUIZ_TOPICS:
        return None
    return topic


def is_self_contained_card_request(message: str) -> bool:
    """True when this turn already names a card — do not reuse a prior Topic."""
    intents = detect_intents(message)
    if not intents:
        return False
    if intents == ["quiz"] and quiz_topic(message) is None:
        return False
    return True


# Local cards that already hold the interaction — model prose must not continue
# the previous turn (QA: timer after an animal quiz still talked about giraffes).
_LOCAL_CHEER_CARD_TYPES = frozenset({"timer", "quiz", "practice", "ask_parent"})
_LOCAL_CARD_CHEER = {
    "timer": "All set! Watch the timer on the card.",
    "quiz": "Quiz time! Use the card to pick your answers.",
    "practice": "Let's practice — the card has your first prompt.",
    "ask_parent": "A grown-up should help with this one.",
}


def messages_for_llm(
    history: list[dict] | None,
    user_message: str,
    user_turn: str,
) -> list[dict]:
    """History for the chat model. Card turns omit prior turns so old quiz/story
    copy cannot steer the reply. Regular questions keep full history."""
    prior: list[dict] = []
    if not is_self_contained_card_request(user_message):
        prior = list(history or [])
    return [*prior, {"role": "user", "content": user_turn}]


def local_card_cheer(message: str, cards: list[ToolCard] | None = None) -> str | None:
    """Deterministic one-liner when a local timer/quiz/practice/ask_parent card
    already answers the turn. None means the model still needs to speak."""
    local = cards if cards is not None else run_local_tools(message)
    types = {card.type for card in local}
    cheer_types = types & _LOCAL_CHEER_CARD_TYPES
    if not cheer_types:
        return None
    if types - _LOCAL_CHEER_CARD_TYPES:
        return None
    leftover = set(detect_intents(message)) - types - {"lookup"}
    if leftover:
        return None
    for card in local:
        if card.type in _LOCAL_CARD_CHEER:
            return _LOCAL_CARD_CHEER[card.type]
    return None


def allowed_card_types(intents: list[str]) -> set[str] | None:
    """Card types this turn may emit. None means the model may choose any type."""
    if not intents:
        return None
    return set(intents) | {"lookup"}


def card_route_for_message(message: str) -> dict[str, Any]:
    intents = detect_intents(message)
    allowed = allowed_card_types(intents)
    return {
        "allow": sorted(allowed) if allowed is not None else None,
        "story_pages": requested_story_pages(message) if "story" in intents else None,
    }


def _lookup_unit(name: str) -> tuple[str, float] | None:
    key = (name or "").strip().lower()
    if not key:
        return None
    for group, table in _UNIT_GROUPS:
        if key in table:
            return group, table[key]
    return None


def _convert_temperature(amount: float, from_unit: str, to_unit: str) -> float | None:
    src = _TEMP_UNITS.get(from_unit.strip().lower())
    dest = _TEMP_UNITS.get(to_unit.strip().lower())
    if not src or not dest:
        return None
    if src == "c":
        celsius = amount
    elif src == "f":
        celsius = (amount - 32) * 5 / 9
    else:
        celsius = amount - 273.15
    if dest == "c":
        return celsius
    if dest == "f":
        return celsius * 9 / 5 + 32
    return celsius + 273.15


def convert_units(text: str) -> dict[str, Any] | None:
    """Local unit conversion — never ask the LLM for the number."""
    message = text or ""
    amount: float | None = None
    from_label = ""
    to_label = ""

    how_many = _CONVERT_HOW_MANY_RE.search(message)
    convert_to = _CONVERT_TO_RE.search(message)
    bare = _CONVERT_BARE_RE.search(message)
    if how_many:
        to_label = how_many.group(1)
        amount = float(how_many.group(2)) if how_many.group(2) else 1.0
        from_label = how_many.group(3)
    elif convert_to:
        amount = float(convert_to.group(1))
        from_label = convert_to.group(2)
        to_label = convert_to.group(3)
    elif bare:
        amount = float(bare.group(1))
        from_label = bare.group(2)
        to_label = bare.group(3)
    else:
        return None

    temp = _convert_temperature(amount, from_label, to_label)
    if temp is not None:
        return {
            "from_amount": _pretty_number(amount),
            "from_unit": from_label,
            "to_unit": to_label,
            "result": _pretty_number(temp),
        }

    src = _lookup_unit(from_label)
    dest = _lookup_unit(to_label)
    if not src or not dest or src[0] != dest[0] or dest[1] == 0:
        return None
    result = amount * src[1] / dest[1]
    return {
        "from_amount": _pretty_number(amount),
        "from_unit": from_label,
        "to_unit": to_label,
        "result": _pretty_number(result),
    }


def ask_parent_card(reason: str | None = None) -> ToolCard:
    if reason == "child_request":
        message = (
            "A parent or trusted grown-up should help with this one. "
            "You can ask them in person, or they can check the parent dashboard."
        )
    else:
        message = (
            "This one needs a parent or trusted grown-up. "
            "They can help you from the parent dashboard — or pick a safer topic "
            "like animals, space, or a hobby you enjoy!"
        )
    return ToolCard(
        "ask_parent",
        {
            "title": "Ask a grown-up",
            "message": message,
            "reason": reason or "safety",
        },
    )


_QUIZ_BANK: dict[str, dict[str, Any]] = {
    "animals": {
        "title": "Animal Quiz Time!",
        "questions": [
            {
                "q": "Which animal is a mammal?",
                "choices": ["Goldfish", "Dog", "Robin", "Frog"],
                "answer": 1,
                "explain": "Dogs are mammals — they have fur and feed their babies milk.",
            },
            {
                "q": "What do bees make?",
                "choices": ["Milk", "Silk", "Honey", "Butter"],
                "answer": 2,
                "explain": "Bees collect nectar and turn it into honey.",
            },
            {
                "q": "Which animal lives in the ocean?",
                "choices": ["Lion", "Dolphin", "Elephant", "Robin"],
                "answer": 1,
                "explain": "Dolphins live in the ocean and swim in groups called pods.",
            },
        ],
    },
    "space": {
        "title": "Space Quiz",
        "questions": [
            {
                "q": "What does Earth orbit?",
                "choices": ["The Moon", "The Sun", "Mars", "A comet"],
                "answer": 1,
                "explain": "Earth travels around the Sun once each year.",
            },
            {
                "q": "Which planet is known as the Red Planet?",
                "choices": ["Venus", "Jupiter", "Mars", "Neptune"],
                "answer": 2,
                "explain": "Mars looks reddish because of rusty iron in its soil.",
            },
            {
                "q": "What lights up the night sky besides stars?",
                "choices": ["The Moon", "The ocean", "Clouds only", "Rainbows"],
                "answer": 0,
                "explain": "The Moon reflects sunlight and is often the brightest thing at night.",
            },
        ],
    },
    "science": {
        "title": "Science Quiz",
        "questions": [
            {
                "q": "What do plants need to make food?",
                "choices": ["Only rocks", "Sunlight, water, and air", "Only sugar", "Only soil"],
                "answer": 1,
                "explain": "Plants use sunlight, water, and air to make their own food.",
            },
            {
                "q": "Water frozen solid is called…",
                "choices": ["Steam", "Ice", "Rain", "Fog"],
                "answer": 1,
                "explain": "When water gets cold enough, it freezes into ice.",
            },
            {
                "q": "Which of these is a source of light?",
                "choices": ["A shadow", "The Sun", "A closed box", "A whisper"],
                "answer": 1,
                "explain": "The Sun is our main source of natural light.",
            },
        ],
    },
}
_QUIZ_ALIASES = {
    "animal": "animals",
    "pets": "animals",
    "zoo": "animals",
    "planets": "space",
    "stars": "space",
    "moon": "space",
    "sun": "space",
    "astronomy": "space",
    "earth": "science",
    "nature": "science",
}


def _quiz_bank_key(topic: str) -> str | None:
    words = re.findall(r"[a-z0-9]+", topic.lower())
    if not words:
        return None
    for candidate in (topic.lower().strip(), words[0], " ".join(words)):
        if candidate in _QUIZ_BANK:
            return candidate
        alias = _QUIZ_ALIASES.get(candidate)
        if alias:
            return alias
    return None


def local_quiz_card(message: str) -> ToolCard | None:
    if "quiz" not in detect_intents(message):
        return None
    topic = quiz_topic(message)
    if not topic:
        return None
    key = _quiz_bank_key(topic)
    if not key:
        return None
    data = _QUIZ_BANK[key]
    return ToolCard("quiz", {"title": data["title"], "questions": data["questions"]})


def local_practice_card(message: str) -> ToolCard | None:
    if "practice" not in detect_intents(message):
        return None
    text = (message or "").lower()
    if "spell" in text:
        return ToolCard(
            "practice",
            {
                "title": "Spelling practice",
                "kind": "spelling",
                "items": [
                    {"prompt": "The animal that says meow", "answer": "cat"},
                    {"prompt": "The color of the sky on a clear day", "answer": "blue"},
                    {"prompt": "A friend you like a lot", "answer": "pal"},
                    {"prompt": "Something you read", "answer": "book"},
                ],
            },
        )
    return ToolCard(
        "practice",
        {
            "title": "Times tables",
            "kind": "times",
            "items": [
                {"prompt": "2 × 3", "answer": "6"},
                {"prompt": "4 × 5", "answer": "20"},
                {"prompt": "6 × 6", "answer": "36"},
                {"prompt": "7 × 2", "answer": "14"},
                {"prompt": "3 × 9", "answer": "27"},
            ],
        },
    )


def _extract_math_expression(message: str) -> str | None:
    asked = _MATH_ASK_RE.search(message.strip())
    candidate = asked.group(1).strip().rstrip("?.!") if asked else message.strip().rstrip("?.!")
    candidate = candidate.replace("×", "*").replace("÷", "/")
    if _EXPR_RE.match(candidate) and re.search(r"\d+\s*[+\-*/x×÷^]\s*\d+", candidate):
        return candidate
    return None


def run_local_tools(message: str, *, timezone: str | None = None) -> list[ToolCard]:
    cards: list[ToolCard] = []
    seconds = parse_timer_seconds(message)
    if seconds:
        cards.append(
            ToolCard(
                "timer",
                {"seconds": seconds, "label": format_duration(seconds)},
            )
        )
    expr = _extract_math_expression(message)
    if expr:
        try:
            cards.append(ToolCard("math", evaluate_math(expr)))
        except (ValueError, ZeroDivisionError, SyntaxError):
            pass
    if is_clock_question(message):
        cards.append(current_clock_card(timezone=timezone))
    converted = convert_units(message)
    if converted:
        cards.append(ToolCard("convert", converted))
    if _ASK_PARENT_RE.search(message or ""):
        cards.append(ask_parent_card("child_request"))
    quiz = local_quiz_card(message)
    if quiz:
        cards.append(quiz)
    practice = local_practice_card(message)
    if practice:
        cards.append(practice)
    return cards


def extract_model_tools(text: str) -> tuple[str, list[ToolCard]]:
    cards: list[ToolCard] = []
    for match in _FENCE_RE.finditer(text):
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        kind = payload.get("type")
        if kind in MODEL_TOOL_TYPES:
            cards.append(ToolCard(kind, {k: v for k, v in payload.items() if k != "type"}))
    cleaned = _FENCE_RE.sub("", text)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned, cards


_MODEL_CARD_SHAPES = {
    "define": "define {word, meaning, example}",
    "quiz": "quiz {title, questions:[{q, choices, answer, explain}]}",
    "facts": "facts {topic, facts}",
    "story": "story {title, pages:[{text, choices?:[{label, message}]}]}",
    "riddle": "riddle {riddle, answer, hint?}",
    "practice": "practice {title, kind, items:[{prompt, answer}]}",
    "howto": "howto {title, steps}",
    "convert": "convert {from_amount, from_unit, to_unit, result}",
    "ask_parent": "ask_parent {title, message}",
}


def apply_card_routing(message: str, cards: list[ToolCard]) -> list[ToolCard]:
    """Drop cards that do not match this turn's intent and trim extra story pages."""
    intents = detect_intents(message)
    allowed = allowed_card_types(intents)
    pages = requested_story_pages(message) if "story" in intents else None
    routed: list[ToolCard] = []
    for card in cards:
        if allowed is not None and card.type not in allowed:
            continue
        if card.type == "story" and pages:
            raw_pages = card.data.get("pages")
            if isinstance(raw_pages, list) and len(raw_pages) > pages:
                card = ToolCard("story", {**card.data, "pages": raw_pages[:pages]})
        routed.append(card)
    return routed


def tool_prompt_hint(
    intents: list[str],
    *,
    local_types: set[str] | None = None,
    story_pages: int | None = None,
) -> str:
    if not intents:
        return ""
    already = local_types or set()
    allowed = [intent for intent in intents if intent != "lookup"]
    parts = [
        "The child's latest message already selected the interactive card. "
        "Answer that request only — do not continue an earlier story, quiz, or topic. "
        f"Do not emit any ```{TOOL_FENCE} card whose type is not: {', '.join(allowed)}.",
    ]
    need_model_fence = False
    if "define" in intents and "define" not in already:
        need_model_fence = True
        parts.append("This is a definition request — include a define card.")
    if "quiz" in intents:
        if "quiz" in already:
            parts.append(
                "A quiz card will already appear. Cheer them on in one short sentence "
                "about this quiz only. Do not continue an earlier topic. Do not emit another quiz."
            )
        else:
            need_model_fence = True
            parts.append(
                "This is a quiz request — include 3–5 multiple-choice questions. answer is the 0-based index."
            )
    if "facts" in intents and "facts" not in already:
        need_model_fence = True
        parts.append("This is a facts request — include 3 short kid-safe facts.")
    if "math" in intents:
        parts.append("A calculator card will already show the number. Explain the steps in plain words.")
    if "timer" in intents:
        parts.append(
            "A timer card will already appear. Cheer them on in one short sentence "
            "about the timer only. Do not mention any earlier quiz, story, or topic. "
            "Do not emit a quiz or story."
        )
    if "clock" in intents:
        parts.append(
            "A clock card shows the exact current local time and date. "
            "Say that time in your reply. Never use placeholders."
        )
    if "story" in intents:
        need_model_fence = True
        page_rule = (
            f"Use exactly {story_pages} page{'s' if story_pages != 1 else ''} — no more."
            if story_pages
            else "Keep the story to 2 short pages unless they asked for a different length."
        )
        parts.append(
            "This is a story request — include a story card with a title and short pages. "
            f"{page_rule} "
            "Each page has text and optional choices [{label, message}]. Keep pages kid-safe."
        )
    if "riddle" in intents and "riddle" not in already:
        need_model_fence = True
        parts.append("This is a riddle request — include a riddle card with riddle, answer, and optional hint.")
    if "practice" in intents:
        if "practice" in already:
            parts.append(
                "A practice card will already appear. Cheer them on in one short sentence "
                "about this practice only. Do not continue an earlier topic. Do not emit another card."
            )
        else:
            need_model_fence = True
            parts.append(
                "This is a practice request — include a practice card. "
                "kind is spelling or times. items are [{prompt, answer}]."
            )
    if "howto" in intents and "howto" not in already:
        need_model_fence = True
        parts.append(
            "This is a how-to or recipe — include a howto card with a title and numbered steps. "
            "Do not tell a story."
        )
    if "convert" in intents:
        parts.append("A conversion card will already show the exact numbers. Explain the units in one short sentence.")
    if "ask_parent" in intents:
        parts.append(
            "An ask-a-grown-up card will already appear. "
            "One short sentence telling them to check with a parent. "
            "Do not continue an earlier topic. Do not tell a story."
        )
    if need_model_fence:
        shapes = [_MODEL_CARD_SHAPES[name] for name in allowed if name in _MODEL_CARD_SHAPES]
        parts.append(
            "Emit ONE fenced JSON card FIRST, before any spoken words, using this exact fence:"
        )
        parts.append(f"```{TOOL_FENCE}")
        parts.append('{"type":"..."}')
        parts.append("```")
        if shapes:
            parts.append("Allowed shape: " + "; ".join(shapes) + ".")
        parts.append("Keep the spoken reply short. Put details in the JSON card. No HTML.")
    else:
        parts.append(f"Do not emit a ```{TOOL_FENCE} fence at all.")
    return " ".join(parts)
