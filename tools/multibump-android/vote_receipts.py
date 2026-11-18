"""Optional read-only provider vote notification receipts.

DiscordInvites can send a vote-event Discord webhook to a channel that the
server owner configures. Matching a trusted webhook is *evidence of a provider
notification*, not cryptographic proof that our Discord user voted and not
authority to submit or fabricate directory votes.

No requests are made to directory sites and no user credentials are used.
"""
from __future__ import annotations

from dataclasses import dataclass
from contextlib import closing
from datetime import datetime, timezone
import sqlite3
import time
from typing import Any, Callable

from response_reader import message_body
from tdl_voting import TDL_KEY, active_guilds

DAY = 86400
MAX_HISTORY = 200
DISCORDINVITES_BOT = "678211574183362571"


def _id(value: Any) -> str:
    raw = str(value)
    if not raw.isdecimal() or not 15 <= len(raw) <= 22:
        raise ValueError("Discord guild, channel and webhook IDs must be 15-22 digits")
    return raw


@dataclass(frozen=True)
class TrustedWebhook:
    provider: str
    guild_id: str
    channel_id: str
    webhook_id: str
    vote_phrase: str


@dataclass(frozen=True)
class VoteNotice:
    provider: str
    guild_id: str
    webhook_id: str
    message_id: str
    observed_at: float


def configured_webhooks(raw: dict) -> tuple[TrustedWebhook, ...]:
    """Observe only a provider's explicitly configured Discord webhook feed.

    TDL's signed JSON event API is an alternative integration for a backend;
    here we process its official formatted Discord-webhook delivery, not an
    untrusted chat message or a request to cast a vote.
    """
    entries = raw.get("vote_notifications", [])
    if not isinstance(entries, list) or len(entries) > 12:
        raise ValueError("vote_notifications must be a list of at most 12 sources")
    dinvites_guilds = {
        str(item.get("guild_id"))
        for item in raw.get("services", [])
        if isinstance(item, dict) and item.get("enabled", True) is not False
        and str(item.get("application_id")) == DISCORDINVITES_BOT
    }
    tdl_guilds = active_guilds(raw)
    seen: set[tuple[str, str]] = set()
    results: list[TrustedWebhook] = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Invalid vote-notification entry")
        provider = entry.get("provider")
        if provider not in {"d-invites", TDL_KEY}:
            raise ValueError("Unsupported vote notification provider")
        guild_id = _id(entry.get("guild_id"))
        channel_id = _id(entry.get("channel_id"))
        webhook_id = _id(entry.get("webhook_id"))
        phrase = entry.get("vote_phrase")
        permitted_guilds = dinvites_guilds if provider == "d-invites" else tdl_guilds
        if guild_id not in permitted_guilds:
            raise ValueError("Vote notification guild must have the corresponding enabled service")
        minimum = 12 if provider == "d-invites" else 5
        keyword = "vote" if provider == "d-invites" else "upvot"
        if (not isinstance(phrase, str) or not minimum <= len(phrase) <= 160
                or keyword not in phrase.casefold() or phrase.strip() != phrase
                or "\n" in phrase or "\r" in phrase):
            raise ValueError("Use a distinctive vote or upvote notice phrase from the provider")
        key = (channel_id, webhook_id)
        if key in seen:
            raise ValueError("Each provider requires a different webhook identity")
        seen.add(key)
        results.append(TrustedWebhook(provider, guild_id, channel_id,
                                      webhook_id, phrase))
    return tuple(results)

def _timestamp(value: Any) -> float | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def observe(message: Any, rules: tuple[TrustedWebhook, ...],
            *, now: float | None = None) -> VoteNotice | None:
    """Trust exact source, age and configured vote-event template only."""
    now = time.time() if now is None else now
    channel = getattr(message, "channel", None)
    guild = getattr(message, "guild", None) or getattr(channel, "guild", None)
    try:
        channel_id = str(int(getattr(channel, "id", 0)))
        guild_id = str(int(getattr(guild, "id", 0)))
        webhook_id = str(int(getattr(message, "webhook_id", 0)))
        message_id = str(int(getattr(message, "id", 0)))
    except (ValueError, TypeError):
        return None
    if message_id == "0" or webhook_id == "0":
        return None
    observed_at = _timestamp(getattr(message, "created_at", None))
    if observed_at is None or not now - DAY <= observed_at <= now + 60:
        return None
    for rule in rules:
        if ((channel_id, guild_id, webhook_id)
                != (rule.channel_id, rule.guild_id, rule.webhook_id)):
            continue
        body = message_body(message)
        if rule.vote_phrase.casefold() not in body.casefold():
            return None
        return VoteNotice(rule.provider, guild_id, webhook_id,
                          message_id, observed_at)
    return None


class VoteNoticeLedger:
    """Append-only observations isolated from the owner vote and bump clocks."""

    def __init__(self, db: sqlite3.Connection):
        self.db = db
        with db:
            db.execute("""CREATE TABLE IF NOT EXISTS provider_vote_notices (
                provider TEXT NOT NULL,
                webhook_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                observed_at REAL NOT NULL,
                recorded_at REAL NOT NULL,
                PRIMARY KEY(provider, message_id)
            )""")

    def record(self, notice: VoteNotice, *, now: float | None = None) -> bool:
        now = time.time() if now is None else now
        with self.db:
            cur = self.db.execute("""INSERT OR IGNORE INTO provider_vote_notices
                (provider,webhook_id,message_id,guild_id,observed_at,recorded_at)
                VALUES(?,?,?,?,?,?)""", (
                    notice.provider, notice.webhook_id, notice.message_id,
                    notice.guild_id, notice.observed_at, now))
        return cur.rowcount == 1


async def recover_history(client: Any, rules: tuple[TrustedWebhook, ...],
                          ledger: VoteNoticeLedger, *,
                          clock: Callable[[], float] | None = None,
                          logger: Any = None) -> dict[str, int]:
    """Bounded backfill for vote-webhook messages missed during a disconnect."""
    clock = time.time if clock is None else clock
    groups: dict[str, list[TrustedWebhook]] = {}
    for rule in rules:
        groups.setdefault(rule.channel_id, []).append(rule)
    checked = recorded = failed = truncated = 0
    for channel_id, group in groups.items():
        try:
            channel = client.get_channel(int(channel_id))
            if channel is None:
                channel = await client.fetch_channel(int(channel_id))
            if not getattr(channel, "history", None):
                raise RuntimeError("Vote notification channel history unavailable")
            seen = 0
            async for message in channel.history(
                limit=MAX_HISTORY,
                after=datetime.fromtimestamp(clock() - DAY, tz=timezone.utc)
            ):
                seen += 1
                notice = observe(message, tuple(group), now=clock())
                if notice and ledger.record(notice):
                    recorded += 1
            checked += 1
            if seen >= MAX_HISTORY:
                truncated += 1
        except Exception as exc:
            failed += 1
            if logger:
                logger.warning("Vote notification history unavailable for channel %s: %s",
                               channel_id, type(exc).__name__)
    return {"channels_checked": checked, "new_notices": recorded,
            "failures": failed, "possibly_truncated": truncated}


def recent_count(db_path: Any, *, now: float | None = None) -> dict[str, int]:
    """Never create a DB when showing status; don't confuse notices with votes."""
    from pathlib import Path
    path = Path(db_path)
    if not path.is_file():
        return {}
    now = time.time() if now is None else now
    try:
        with closing(sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)) as db:
            found = db.execute("""SELECT name FROM sqlite_master
                WHERE type='table' AND name='provider_vote_notices'""").fetchone()
            if not found:
                return {}
            return {row[0]: row[1] for row in db.execute(
                "SELECT provider, COUNT(*) FROM provider_vote_notices "
                "WHERE observed_at >= ? GROUP BY provider", (now - DAY,))}
    except (sqlite3.Error, OSError):
        return {}
