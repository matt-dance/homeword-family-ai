"""Pytest configuration — set env before app imports."""

import os
import tempfile

# Ensure policies path is set for all tests
os.environ.setdefault("HOMEWARD_POLICIES_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "policies"))
