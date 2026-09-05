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

_TIMER_RE = re.compile(
    r"\b(?:set\s+(?:a\s+)?timer|timer|remind\s+me|countdown)\b.*?\b(\d+(?:\.\d+)?)\s*"
    r"(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b",
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
    r"\b(?:how (?:do i|to) (?:make|bake|cook|do|build|tie|draw|clean)|"
    r"recipe for|step[- ]by[- ]step)\b",
    re.IGNORECASE,
)
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
    "lookup_request",
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
    match = _TIMER_RE.search(text) or _TIMER_IN_RE.search(text)
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
    return intents


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
    return ToolCard(
        "ask_parent",
        {
            "title": "Ask a grown-up",
            "message": (
                "This one needs a parent or trusted grown-up. "
                "They can help you from the parent dashboard — or pick a safer topic "
                "like animals, space, or a hobby you enjoy!"
            ),
            "reason": reason or "safety",
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


def tool_prompt_hint(intents: list[str]) -> str:
    if not intents:
        return ""
    parts = [
        "When it fits the child's request, also emit ONE fenced JSON card using this exact fence:",
        f"```{TOOL_FENCE}",
        '{"type":"..."}',
        "```",
        "Allowed types: define {word, meaning, example}, quiz {title, questions:[{q, choices, answer, explain}]}, "
        "facts {topic, facts}, story {title, pages:[{text, choices?:[{label, message}]}]}, "
        "riddle {riddle, answer, hint?}, practice {title, kind, items:[{prompt, answer}]}, "
        "howto {title, steps}, convert {from_amount, from_unit, to_unit, result}, ask_parent {title, message}.",
        "Keep the spoken reply short. Put details in the JSON card. No HTML.",
    ]
    if "define" in intents:
        parts.append("This is a definition request — include a define card.")
    if "quiz" in intents:
        parts.append("This is a quiz request — include 3–5 multiple-choice questions. answer is the 0-based index.")
    if "facts" in intents:
        parts.append("This is a facts request — include 3 short kid-safe facts.")
    if "math" in intents:
        parts.append("A calculator card will already show the number. Explain the steps in plain words.")
    if "timer" in intents:
        parts.append("A timer card will appear. Cheer them on in one short sentence.")
    if "clock" in intents:
        parts.append(
            "A clock card shows the exact current local time and date. "
            "Say that time in your reply. Never use placeholders."
        )
    if "story" in intents:
        parts.append(
            "This is a story request — include a story card with a title and short pages. "
            "Each page has text and optional choices [{label, message}]. Keep pages kid-safe."
        )
    if "riddle" in intents:
        parts.append("This is a riddle request — include a riddle card with riddle, answer, and optional hint.")
    if "practice" in intents:
        parts.append(
            "This is a practice request — include a practice card. "
            "kind is spelling or times. items are [{prompt, answer}]."
        )
    if "howto" in intents:
        parts.append("This is a how-to or recipe — include a howto card with a title and numbered steps.")
    if "convert" in intents:
        parts.append("A conversion card will already show the exact numbers. Explain the units in one short sentence.")
    return " ".join(parts)
