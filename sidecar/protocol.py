"""Line-delimited JSON protocol over stdio.

Every event is one JSON object on its own line written to stdout. Commands are
read the same way from stdin. A single lock guards stdout so events emitted from
different threads/tasks never interleave.
"""

from __future__ import annotations

import json
import sys
import threading
from typing import Any, Iterator

# Force UTF-8 on the pipes. On Windows the default is the legacy cp1252 codec,
# which raises UnicodeEncodeError on track titles containing characters like
# U+200B (zero-width space), CJK, etc. — that previously crashed search.
for _stream in (sys.stdout, sys.stdin):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

_write_lock = threading.Lock()


def emit(event_type: str, **fields: Any) -> None:
    """Write a single event line to stdout."""
    payload = {"type": event_type, **fields}
    line = json.dumps(payload, ensure_ascii=False, default=str)
    with _write_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def log(message: str, level: str = "info") -> None:
    emit("log", level=level, message=message)


def read_commands() -> Iterator[dict[str, Any]]:
    """Yield command objects parsed from stdin, one per line, until EOF."""
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            log(f"ignored malformed command: {raw[:120]}", level="warning")
            continue
        if isinstance(obj, dict):
            yield obj
