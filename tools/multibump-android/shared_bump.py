"""Read-only public-directory-bot confirmation parsing and history recovery.

Only evidence from configured bot IDs in the configured guild/channel is trusted.
A visible message cannot prove anything about ephemeral messages or unseen history.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable
import re
import time

from engine import Service, classify
from response_reader import message_body, next_bump_wait


@dataclass(frozen=True)
class SharedEvidence:
    message_id: int
    observed_at: float
    hold_until: float
    event: str  # public_bump or public_cooldown; only the former proves success
    note: str


def _timestamp(value: Any) -> float | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def public_evidence(message: Any, service: Service, *, self_id: int | None = None,
                    now: float | None = None, extra_delay: int = 120) -> SharedEvidence | None:
    """Reject spoofed, stale, ambiguous, or self-invoked bot replies.

    Public confirmation is distinguished from an explicit server-wide next-bump
    deadline. Counter-only Discordify cards are not proof of a *new* bump.
    """
    now = time.time() if now is None else now
    channel = getattr(message, "channel", None)
    guild = getattr(message, "guild", None) or getattr(channel, "guild", None)
    author = getattr(message, "author", None)
    try:
        if (int(getattr(channel, "id", 0)) != service.channel_id
                or int(getattr(guild, "id", 0)) != service.guild_id
                or int(getattr(author, "id", 0)) != service.response_author_id):
            return None
        message_id = int(getattr(message, "id", 0))
    except (TypeError, ValueError):
        return None
    if message_id <= 0:
        return None
    observed_at = _timestamp(getattr(message, "created_at", None))
    if observed_at is None or observed_at > now + 60:
        return None
    # Anything older than a complete configured cycle cannot delay the next attempt.
    if now - observed_at > service.cooldown_seconds + 86400:
        return None
    metadata = getattr(message, "interaction_metadata", None) or getattr(message, "interaction", None)
    invoker = getattr(metadata, "user", None)
    if self_id is not None and getattr(invoker, "id", None) is not None:
        try:
            if int(invoker.id) == self_id:
                return None
        except (TypeError, ValueError):
            return None
    body = message_body(message)
    if not body:
        return None
    classification = classify(body, service)
    if classification == "cooldown":
        # A rejection alone is NOT evidence of another person's successful bump.
        return None
    confirmed = classification == "confirmed"
    if not confirmed and service.application_id == 1222548162741538938:
        confirmed = bool(re.search(r"\bbumped\s*[.!]?\s*\+\s*1\s+boost\s+earned\b", body, re.I))
    if not confirmed:
        # Some bots (e.g. Discordify) return only a status card. Respect an
        # explicitly server-wide future eligibility timestamp, but don't call
        # this a confirmed bump, and never trust a user-specific timer.
        if re.search(r"\bthis\s+server\s+can\s+be\s+bumped\s+again\b", body, re.I):
            wait = next_bump_wait(body, now=observed_at)
            if wait is not None:
                return SharedEvidence(message_id, observed_at, observed_at + wait + extra_delay,
                                      "public_cooldown", "Directory bot reports server-wide next-bump deadline")
        return None
    wait = next_bump_wait(body, now=observed_at)
    hold_until = observed_at + max(service.cooldown_seconds, wait or 0) + extra_delay
    return SharedEvidence(message_id, observed_at, hold_until, "public_bump",
                          "Public success message from configured directory bot")


async def recover_public_history(client: Any, services: list[Service], store: Any,
                                 *, self_id: int | None = None,
                                 logger: Any = None,
                                 clock: Callable[[], float] | None = None,
                                 limit: int = 200) -> dict[str, int]:
    """Backfill bounded public history before dispatching due commands.

    A failed or truncated history scan is reported, not misrepresented as
    complete evidence. This never invokes any directory command.
    """
    # Resolve default clock at call time so simulated time and late restarts
    # cannot be pinned to an import-time function reference.
    clock = time.time if clock is None else clock
    groups: dict[int, list[Service]] = {}
    for svc in services:
        groups.setdefault(svc.channel_id, []).append(svc)
    observed = 0
    channels_checked = 0
    failures = 0
    truncated = 0
    for channel_id, group in groups.items():
        try:
            channel = client.get_channel(channel_id)
            if channel is None:
                channel = await client.fetch_channel(channel_id)
            if not getattr(channel, "history", None):
                raise RuntimeError("Channel history is unavailable")
            span = max(s.cooldown_seconds for s in group) + 86400
            after = datetime.fromtimestamp(clock() - span, tz=timezone.utc)
            seen = 0
            async for message in channel.history(limit=limit, after=after):
                seen += 1
                for svc in group:
                    proof = public_evidence(message, svc, self_id=self_id,
                                            now=clock(), extra_delay=store.timing.extra_delay_min_seconds)
                    if proof is not None and store.record_public_bump(svc, proof):
                        observed += 1
            channels_checked += 1
            if seen >= limit:
                truncated += 1
                if logger:
                    logger.warning("Public history scan reached %d messages for channel %s; older evidence may be missed", limit, channel_id)
        except Exception as exc:
            failures += 1
            if logger:
                logger.warning("Unable to read public bump history for channel %s: %s: %s", channel_id, type(exc).__name__, exc)
    return {"channels_checked": channels_checked, "new_observations": observed,
            "failures": failures, "possibly_truncated": truncated}
