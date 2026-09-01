"""Local kid-chat tools: math, timer, plus structured cards from the model."""

from __future__ import annotations

import ast
import json
import operator
import re
from dataclasses import dataclass
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
_FENCE_RE = re.compile(
    rf"```{TOOL_FENCE}\s*(\{{[\s\S]*?\}})\s*```",
    re.IGNORECASE,
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
    return intents


def _extract_math_expression(message: str) -> str | None:
    asked = _MATH_ASK_RE.search(message.strip())
    candidate = asked.group(1).strip().rstrip("?.!") if asked else message.strip().rstrip("?.!")
    candidate = candidate.replace("×", "*").replace("÷", "/")
    if _EXPR_RE.match(candidate) and re.search(r"\d+\s*[+\-*/x×÷^]\s*\d+", candidate):
        return candidate
    return None


def run_local_tools(message: str) -> list[ToolCard]:
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
    return cards


def extract_model_tools(text: str) -> tuple[str, list[ToolCard]]:
    cards: list[ToolCard] = []
    for match in _FENCE_RE.finditer(text):
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        kind = payload.get("type")
        if kind in {"define", "quiz", "facts", "math", "timer"}:
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
        "Allowed types: define {word, meaning, example}, quiz {title, questions:[{q, choices, answer, explain}]}, facts {topic, facts}.",
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
    return " ".join(parts)
