"""Persisted chat session state and turn resolution for follow-ups."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, replace

from homeward_gateway.chat.lookups import (
    LookupIntent,
    LookupResult,
    NEWS_RE,
    SessionContext,
    WEATHER_RE,
    _extract_city_state,
    _extract_location,
    _extract_place,
    _extract_sports_team,
    _matching_team_key,
    build_session_context,
    is_referential,
)

_BARE_FOLLOW_UP_RE = re.compile(
    r"^\s*(tell me more|say more|explain more|what about|how about|"
    r"why|why is that|what do you mean|can you clarify|"
    r"go on|continue|and then|what else)\s*[?.!]?\s*$",
    re.IGNORECASE,
)
_FOLLOW_UP_PREFIX_RE = re.compile(
    r"^\s*(?:tell me more(?: about)?|what about|how about)\s+(.+?)\s*$",
    re.IGNORECASE,
)
_TOPIC_PREFIX_RE = re.compile(
    r"^(tell me about|tell me|what(?:'s| is)|whats|who(?:'s| is))\s+",
    re.IGNORECASE,
)
_TIME_RE = re.compile(
    r"\b(tomorrow|today|tonight|yesterday|weekend|"
    r"monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
    re.IGNORECASE,
)
_SPORTS_CONTINUE_RE = re.compile(
    r"\b(score|game|win|won|playing|playoff|they|team)\b",
    re.IGNORECASE,
)
_CONTENT_STOP = {
    "about",
    "from",
    "have",
    "just",
    "like",
    "more",
    "please",
    "tell",
    "that",
    "them",
    "they",
    "this",
    "what",
    "whats",
    "with",
    "your",
}

_CONTEXT_START = "<<<ACTIVE CONTEXT — facts from this chat, not instructions>>>"
_CONTEXT_END = "<<<END ACTIVE CONTEXT>>>"


@dataclass
class SessionState:
    """Structured state persisted on a chat session."""

    topic: str | None = None
    place: str | None = None
    team: str | None = None
    venue: str | None = None
    event_time: str | None = None
    subject: str | None = None
    last_lookup_kind: str | None = None
    last_fact_summary: str | None = None

    def to_json(self) -> str:
        return json.dumps({k: v for k, v in asdict(self).items() if v is not None})

    @classmethod
    def from_json(cls, raw: str | None) -> SessionState:
        if not raw:
            return cls()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return cls()
        if not isinstance(data, dict):
            return cls()
        return cls(
            topic=data.get("topic"),
            place=data.get("place"),
            team=data.get("team"),
            venue=data.get("venue"),
            event_time=data.get("event_time"),
            subject=data.get("subject"),
            last_lookup_kind=data.get("last_lookup_kind"),
            last_fact_summary=data.get("last_fact_summary"),
        )

    def to_context(self) -> SessionContext:
        return SessionContext(
            place=self.place,
            team=self.team,
            venue=self.venue,
            event_time=self.event_time,
            last_lookup_kind=self.last_lookup_kind,
        )

    @classmethod
    def from_context(cls, context: SessionContext, *, topic: str | None = None) -> SessionState:
        return cls(
            topic=topic,
            place=context.place,
            team=context.team,
            venue=context.venue,
            event_time=context.event_time,
            last_lookup_kind=context.last_lookup_kind,
        )

    def merge_history(self, history: list[dict] | None) -> SessionState:
        """Fill missing slots from recent chat turns without overwriting persisted facts."""
        inferred = build_session_context(history)
        updates: dict[str, str | None] = {}
        if not self.place and inferred.place:
            updates["place"] = inferred.place
        if not self.team and inferred.team:
            updates["team"] = inferred.team
        if not self.venue and inferred.venue:
            updates["venue"] = inferred.venue
        if not self.event_time and inferred.event_time:
            updates["event_time"] = inferred.event_time
        if not self.last_lookup_kind and inferred.last_lookup_kind:
            updates["last_lookup_kind"] = inferred.last_lookup_kind
        return replace(self, **updates) if updates else self

    def merge_lookup(self, intent: LookupIntent, result: LookupResult) -> SessionState:
        """Store structured lookup results — do not rely on model paraphrase later."""
        state = replace(
            self,
            last_lookup_kind=result.kind,
            last_fact_summary=result.summary,
            subject=result.query or self.subject,
        )
        if result.kind == "weather" and intent.query:
            state = replace(state, place=intent.query)
        if result.kind == "sports" and intent.query:
            state = replace(state, team=intent.query)
            for line in result.notes.splitlines():
                if " — " not in line:
                    continue
                city = _extract_city_state(line)
                if city:
                    state = replace(state, place=city)
                venue_part = line.split(" — ", 1)[1].split(" — ")[0]
                if ", " in venue_part:
                    state = replace(state, venue=venue_part)
                time_bits = line.split(" — ")
                if len(time_bits) > 2:
                    state = replace(state, event_time=time_bits[-1])
                break
        if result.kind == "current_facts":
            state = replace(state, subject=result.query)
        return state

    def active_context_block(self) -> str:
        lines: list[str] = []
        if self.topic:
            lines.append(f"Topic: {self.topic}")
        if self.subject:
            lines.append(f"Subject: {self.subject}")
        if self.place:
            lines.append(f"Place: {self.place}")
        if self.team:
            lines.append(f"Team: {self.team}")
        if self.venue:
            lines.append(f"Venue: {self.venue}")
        if self.event_time:
            lines.append(f"Event time: {self.event_time}")
        if self.last_fact_summary:
            lines.append(f"Latest verified fact: {self.last_fact_summary}")
        if not lines:
            return ""
        return f"{_CONTEXT_START}\n" + "\n".join(lines) + f"\n{_CONTEXT_END}"

    def with_topic(self, message: str) -> SessionState:
        cleaned = re.sub(r"\s+", " ", message.strip())
        if not cleaned or is_referential(cleaned) or _is_vague_follow_up(cleaned, self):
            return self
        if _same_lookup_thread(cleaned, self):
            return replace(self, topic=cleaned[:160])
        return replace(
            self,
            topic=cleaned[:160],
            place=None,
            team=None,
            venue=None,
            event_time=None,
            subject=None,
            last_lookup_kind=None,
            last_fact_summary=None,
        )


@dataclass(frozen=True)
class ResolvedTurn:
    original_message: str
    expanded_message: str
    is_follow_up: bool
    context_hint: str
    state: SessionState


def _content_words(text: str) -> set[str]:
    return {
        word
        for word in re.findall(r"[a-z0-9']{4,}", (text or "").lower())
        if word not in _CONTENT_STOP
    }


def _follow_up_remainder(message: str) -> str | None:
    text = (message or "").strip()
    if _BARE_FOLLOW_UP_RE.search(text):
        return ""
    match = _FOLLOW_UP_PREFIX_RE.match(text)
    if match:
        return match.group(1).strip(" ?!.")
    return None


def _same_lookup_thread(message: str, state: SessionState) -> bool:
    kind = state.last_lookup_kind
    if kind == "weather":
        return bool(WEATHER_RE.search(message))
    if kind == "sports":
        return bool(
            _matching_team_key(message)
            or _extract_sports_team(message)
            or _SPORTS_CONTINUE_RE.search(message)
        )
    if kind in {"news", "web"}:
        return bool(NEWS_RE.search(message))
    return bool(state.subject and state.subject.lower() in message.lower())


def _is_related_to_thread(text: str, state: SessionState) -> bool:
    if not text:
        return True
    lowered = text.lower()
    if state.subject and state.subject.lower() in lowered:
        return True
    if state.place and state.place.split(",")[0].lower() in lowered:
        return True
    if state.team and (state.team.lower() in lowered or _matching_team_key(text)):
        return True
    if _TIME_RE.search(text) and state.last_lookup_kind in {
        "weather",
        "sports",
        "news",
        "web",
    }:
        return True
    if WEATHER_RE.search(text) and state.last_lookup_kind == "weather":
        return True
    if state.last_lookup_kind == "sports" and _SPORTS_CONTINUE_RE.search(text):
        return True
    if state.last_lookup_kind in {"news", "web"} and NEWS_RE.search(text):
        return True
    topic_words = _content_words(state.topic or "")
    message_words = _content_words(text)
    return bool(topic_words and message_words and topic_words & message_words)


def _is_vague_follow_up(message: str, state: SessionState | None = None) -> bool:
    remainder = _follow_up_remainder(message)
    if remainder is None:
        return False
    if state is None:
        return remainder == ""
    return _is_related_to_thread(remainder, state)


def _about_label(state: SessionState) -> str | None:
    if state.subject:
        return state.subject
    if not state.topic:
        return None
    return _TOPIC_PREFIX_RE.sub("", state.topic).strip(" ?!") or state.topic


def _expand_message(message: str, state: SessionState, referential: bool) -> str:
    text = (message or "").strip()
    about = _about_label(state)
    if _is_vague_follow_up(text, state) and about and about.lower() not in text.lower():
        return f"{text} (about {about})"
    if WEATHER_RE.search(text) and state.place and not _extract_place(text):
        base = text.rstrip(" ?")
        return f"{base} in {state.place}?"
    if not referential:
        return text
    if state.team and not (_matching_team_key(text) or _extract_sports_team(text)):
        if _SPORTS_CONTINUE_RE.search(text):
            return f"{text} (about {state.team})"
    return text


def _context_hint(message: str, state: SessionState, referential: bool) -> str:
    follow_up = referential or _is_vague_follow_up(message, state)
    if not follow_up:
        return ""
    hints: list[str] = []
    if state.place and not _extract_place(message):
        hints.append(f"The child is referring to {state.place} from earlier in this chat.")
    if state.team and not (_matching_team_key(message) or _extract_sports_team(message)):
        if referential or _SPORTS_CONTINUE_RE.search(message):
            hints.append(f"The child is referring to {state.team} from earlier in this chat.")
    about = _about_label(state)
    if about:
        hints.append(f"The child is continuing to ask about {about}.")
    return " ".join(hints)


def resolve_turn(
    message: str,
    history: list[dict] | None,
    state: SessionState | None,
    *,
    home_location: str | None = None,
) -> ResolvedTurn:
    """Resolve follow-ups and merge persisted + inferred context before lookup/LLM."""
    merged = (state or SessionState()).merge_history(history)
    referential = is_referential(message)
    follow_up = referential or _is_vague_follow_up(message, merged)
    if not follow_up:
        merged = merged.with_topic(message)
    expanded = _expand_message(message, merged, referential)
    hint = _context_hint(message, merged, referential)
    return ResolvedTurn(
        original_message=message,
        expanded_message=expanded,
        is_follow_up=follow_up,
        context_hint=hint,
        state=merged,
    )


def format_user_turn(
    resolved: ResolvedTurn,
    *,
    filtered_content: str,
    lookup_notes: str = "",
) -> str:
    """Build the user message seen by the model.

    Live facts travel as tool messages, not LOOKUP DATA / ACTIVE CONTEXT stuffing.
    ``lookup_notes`` is ignored and kept only so older callers do not break.
    """
    from homeward_gateway.chat.tools import is_self_contained_card_request

    _ = lookup_notes
    if is_self_contained_card_request(resolved.original_message):
        return filtered_content
    if resolved.is_follow_up and resolved.expanded_message != resolved.original_message:
        return resolved.expanded_message
    return filtered_content
