"""Generation limits. Reply length is guided in the prompt, not hard-cut."""

# High ceiling so the model can finish a thought. Style length lives in the prompt.
GENERATION_MAX_TOKENS = 4096
