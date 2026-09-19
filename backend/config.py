import os
from pathlib import Path

# Minimal .env loader. No python-dotenv dependency for 8 lines of parsing.
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://papertrail:papertrail@localhost:5433/papertrail"
)
EMBED_MODEL = os.environ.get("EMBED_MODEL", "gemini-embedding-001")
EMBED_DIM = int(os.environ.get("EMBED_DIM", "768"))
CHAT_MODEL = os.environ.get("CHAT_MODEL", "gemini-3.5-flash-lite")
