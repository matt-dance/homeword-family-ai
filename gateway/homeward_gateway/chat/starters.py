"""Conversation starters derived from preset allowed topics."""

from homeward_gateway.pipeline.policy import PolicyPreset

# Kid-friendly prompts keyed by common allowed_topic labels
_TOPIC_PROMPTS: dict[str, str] = {
    "animals": "Tell me something cool about animals!",
    "nature": "What's something amazing in nature?",
    "science": "Can you teach me a fun science fact?",
    "art": "Let's talk about art — give me an idea to try!",
    "music": "Tell me something fun about music!",
    "friendship": "What makes a good friend?",
    "school": "Help me with something for school!",
    "hobbies": "Suggest a fun hobby I could try!",
    "stories": "Tell me a short story!",
    "history": "Tell me a cool history fact!",
    "geography": "Teach me about a place in the world!",
    "technology": "Explain a tech thing in a simple way!",
    "coding": "Help me learn something about coding!",
    "sports": "Tell me something fun about sports!",
    "books": "Recommend a type of book I might like!",
    "math": "Help me understand a math idea!",
    "space": "Tell me something awesome about space!",
    "academics": "Help me study smarter!",
    "career": "What kinds of jobs might fit my interests?",
    "relationships": "How do people get along better?",
    "mental health": "What helps when you're feeling stressed?",
    "news": "Explain something in the news in a simple way!",
    "creative writing": "Help me start a creative writing idea!",
}


def _prompt_for_topic(topic: str) -> str:
    key = topic.lower().strip()
    if key in _TOPIC_PROMPTS:
        return _TOPIC_PROMPTS[key]
    return f"Let's talk about {topic}!"


def get_conversation_starters(preset: PolicyPreset, limit: int = 6) -> list[dict[str, str]]:
    """Return tappable starter prompts for the kid chat empty state."""
    topics = preset.allowed_topics[:limit]
    starters = [{"label": topic.title(), "message": _prompt_for_topic(topic)} for topic in topics]
    extras = [
        {"label": "Quiz me", "message": "Quiz me about animals!"},
        {"label": "Fun facts", "message": "Give me 3 fun facts about space!"},
        {"label": "Timer", "message": "Set a timer for 2 minutes."},
        {"label": "Word help", "message": "What does photosynthesis mean?"},
    ]
    existing = {s["label"] for s in starters}
    for extra in extras:
        if extra["label"] not in existing:
            starters.append(extra)
    return starters
