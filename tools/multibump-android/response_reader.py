"""Pure-Python evidence extraction for slash-command responses.

A command being invoked, an empty message, or a generic status card is NOT
proof that a directory accepted a bump. Never turn silence into success.
"""
from __future__ import annotations

from datetime import datetime, timezone
import re
import time
from typing import Any

from engine import Service, classify, parse_wait_seconds


def message_body(message: Any) -> str:
    parts: list[str] = []
    def add(value: Any) -> None:
        if value is not None:
            text = str(value).strip()
            if text:
                parts.append(text)
    add(getattr(message, "content", None))
    for embed in getattr(message, "embeds", None) or []:
        add(getattr(embed, "title", None))
        add(getattr(embed, "description", None))
        add(getattr(embed, "footer", None) and getattr(embed.footer, "text", None))
        for field in getattr(embed, "fields", None) or []:
            add(getattr(field, "name", None))
            add(getattr(field, "value", None))
    return "\n".join(parts)


def response_matches(message: Any, service: Service, start: datetime, user_id: int | None = None) -> bool:
    channel = getattr(message, "channel", None)
    author = getattr(message, "author", None)
    if (int(getattr(channel, "id", 0)) != service.channel_id
            or int(getattr(author, "id", 0)) != service.response_author_id):
        return False
    # A pre-existing message edited during our window is not necessarily a
    # response to this invocation. Check its *creation* time as well.
    message_time = getattr(message, "created_at", None)
    if not isinstance(message_time, datetime):
        return False
    if message_time.tzinfo is None:
        message_time = message_time.replace(tzinfo=timezone.utc)
    if message_time < start:
        return False
    meta = getattr(message, "interaction_metadata", None) or getattr(message, "interaction", None)
    invoker = getattr(meta, "user", None)
    if user_id is not None and invoker is not None and int(getattr(invoker, "id", 0)) != user_id:
        return False
    return True


def bump_count(text: str) -> int | None:
    # Discordify puts the running count inside a status-style embed. That count
    # is only evidence when it increases from a previously observed baseline.
    match = re.search(r"\btotal\s+bumps\s+by\s+[^:\n]{1,90}:\s*\*{0,2}([0-9]{1,9})\b", text, re.I)
    return int(match.group(1)) if match else None


def next_bump_wait(text: str, now: float | None = None) -> int | None:
    """Read an explicit service 'next bump' deadline, not arbitrary timestamps."""
    now = time.time() if now is None else now
    # Only service-specific availability labels qualify. A stats card may
    # contain unrelated Discord timestamps that must not change the schedule.
    match = re.search(
        r"\b(?:can\s+be\s+bumped\s+again|can\s+bump\s+again|"
        r"next\s+(?:bump|vote)(?:\s+(?:at|in))?)\s*:?\s*<t:(\d{10,11})(?::[a-zA-Z])?>",
        text, re.I,
    )
    if not match:
        return None
    remaining = int(match.group(1)) - int(now)
    return remaining if 0 < remaining <= 7 * 86400 else None


def evaluate(text: str, service: Service, *, prior_bumps: int | None = None, now: float | None = None) -> tuple[str, str, int | None, int | None]:
    """(result, reason, wait, bump count) - no false positive confirmations."""
    observed = bump_count(text)
    wait = next_bump_wait(text, now=now)
    result = classify(text, service)
    if result == "cooldown":
        return result, "service reports a cooldown", parse_wait_seconds(text) or wait, observed
    if result == "confirmed":
        return result, "explicit success confirmation", wait, observed
    # Discadia's real success response is a named server + earned boost,
    # rather than the generic "successfully bumped" phrase. Existing saved
    # configs may carry the old patterns, so this narrowly scoped rule lives
    # in the reader and works without modifying the user's config.json.
    if (service.application_id == 1222548162741538938
            and re.search(r"\bbumped\s*[.!]?\s*\+\s*1\s+boost\s+earned\b", text, re.I)):
        return "confirmed", "Discadia reports bump and earned boost", wait, observed
    if observed is not None and prior_bumps is not None and observed > prior_bumps:
        return "confirmed", f"bump counter increased from {prior_bumps} to {observed}", wait, observed
    if text.strip():
        return "response_seen", "response received, but no verified success or wait", wait, observed
    return "no_confirmation", "empty response, no success evidence", None, observed
