"""Pure-Python configuration, durable scheduling and confirmation classification.

No Discord credentials or network calls live in this module.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import random
import re
import sqlite3
import time
from typing import Any


@dataclass(frozen=True)
class Timing:
    """Extra waiting after a cooldown; never subtract from a service's limit."""

    extra_delay_min_seconds: int = 120
    extra_delay_max_seconds: int = 1020

    def __post_init__(self):
        low, high = self.extra_delay_min_seconds, self.extra_delay_max_seconds
        if type(low) is not int or type(high) is not int or not 60 <= low <= high <= 86400:
            raise ValueError("timing extra delay must be whole seconds: 60 <= minimum <= maximum <= 86400")

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> Timing:
        value = config.get("timing", {})
        if not isinstance(value, dict):
            raise ValueError("timing must be an object")
        unknown = set(value) - {"extra_delay_min_seconds", "extra_delay_max_seconds"}
        if unknown:
            raise ValueError(f"Unknown timing settings: {', '.join(sorted(unknown))}")
        return cls(**value)


@dataclass(frozen=True)
class Service:
    key: str
    label: str
    guild_id: int
    channel_id: int
    application_id: int
    command_name: str
    cooldown_seconds: int
    success_patterns: tuple[str, ...]
    cooldown_patterns: tuple[str, ...]
    options: dict[str, Any]
    response_author_id: int


def _snowflake(raw: Any, name: str) -> int:
    value = str(raw)
    if not value.isdecimal() or not 15 <= len(value) <= 22:
        raise ValueError(f"{name}: expected an actual Discord numeric ID, got {value!r}")
    return int(value)


def load_config(path: str | Path) -> tuple[dict[str, Any], list[Service]]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(raw.get("services"), list):
        raise ValueError("config must contain a 'services' array")
    services = []
    seen = set()
    for item in raw["services"]:
        if item.get("enabled", True) is False:
            continue
        key = str(item.get("id", "")).strip()
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", key) or key in seen:
            raise ValueError(f"Invalid or duplicate service id: {key!r}")
        seen.add(key)
        cooldown = int(item.get("cooldown_seconds", 0))
        if not (300 <= cooldown <= 7 * 24 * 3600):
            raise ValueError(f"{key}: cooldown_seconds must be 300..604800")
        cmd = str(item.get("command_name", "")).strip().lstrip("/")
        if not re.fullmatch(r"[a-z0-9_-]+(?: [a-z0-9_-]+){0,2}", cmd):
            raise ValueError(f"{key}: invalid command name")
        success = tuple(item.get("success_patterns", []))
        blocked = tuple(item.get("cooldown_patterns", []))
        if not success or not blocked:
            raise ValueError(f"{key}: configure both success_patterns and cooldown_patterns")
        for pattern in success + blocked:
            re.compile(pattern, re.I)
        options = item.get("options", {})
        if not isinstance(options, dict):
            raise ValueError(f"{key}: options must be an object")
        app_id = _snowflake(item.get("application_id"), f"{key}.application_id")
        services.append(Service(
            key=key, label=str(item.get("label", key)),
            guild_id=_snowflake(item.get("guild_id"), f"{key}.guild_id"),
            channel_id=_snowflake(item.get("channel_id"), f"{key}.channel_id"),
            application_id=app_id,
            command_name=cmd,
            cooldown_seconds=cooldown,
            success_patterns=success,
            cooldown_patterns=blocked,
            options=options,
            response_author_id=_snowflake(item.get("response_author_id", app_id), f"{key}.response_author_id"),
        ))
    if not services:
        raise ValueError("No enabled, configured services")
    interval = int(raw.get("check_interval_seconds", 30))
    timeout = int(raw.get("confirmation_timeout_seconds", 30))
    if not (10 <= interval <= 600) or not (5 <= timeout <= 120):
        raise ValueError("check_interval_seconds must be 10..600; confirmation_timeout_seconds 5..120")
    Timing.from_config(raw)
    return raw, services


def classify(text: str, service: Service) -> str:
    """Negative patterns take priority over positive ones. Unknown != success."""
    if any(re.search(p, text, re.I) for p in service.cooldown_patterns):
        return "cooldown"
    if any(re.search(p, text, re.I) for p in service.success_patterns):
        return "confirmed"
    return "response_seen"


def parse_wait_seconds(text: str) -> int | None:
    """Read one remaining wait, without adding repeated replies or advertised intervals."""
    units = {
        "d": 86400, "day": 86400, "days": 86400,
        "h": 3600, "hr": 3600, "hrs": 3600, "hour": 3600, "hours": 3600,
        "m": 60, "min": 60, "mins": 60, "minute": 60, "minutes": 60,
        "s": 1, "sec": 1, "secs": 1, "second": 1, "seconds": 1,
    }
    # Formatting can wrap the number separately from its unit.
    clean = re.sub(r"[*_`~]", "", text)
    part = r"\d{1,4}[ \t]*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![A-Za-z])"
    duration = r"(?<![\w.])" + part + r"(?:\s*(?:,\s*)?(?:and\s+)?" + part + r")*(?!\w)"
    token = re.compile(r"(\d{1,4})[ \t]*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![A-Za-z])", re.I)

    def seconds(value: str) -> int | None:
        parts = token.findall(value)
        scales = [units[unit.lower()] for _, unit in parts]
        if any(first <= second for first, second in zip(scales, scales[1:])):
            return None
        result = sum(int(number) * units[unit.lower()] for number, unit in parts)
        return result if 0 < result <= 7 * 86400 else None

    # Explicit remaining-wait instructions take priority over generic cooldown labels.
    instruction = (
        r"\b(?:wait(?:[ \t]+(?:for|another|at[ \t]+least))?"
        r"|try[ \t]+again[ \t]+(?:in|after)"
        r"|(?:can[ \t]+)?(?:bump|vote)[ \t]+again[ \t]+(?:in|after)"
        r"|(?:next[ \t]+(?:bump|vote)|remaining[ \t]+cooldown|cooldown[ \t]+remaining)[ \t]*(?:in|is|:)?"
        r")[ \t]*:?[ \t]*(" + duration + r")"
    )
    candidates = [seconds(match.group(1)) for match in re.finditer(instruction, clean, re.I)]
    if candidates:
        # Conflicting remaining waits are uncertain: use the configured fallback.
        return candidates[0] if None not in candidates and len(set(candidates)) == 1 else None
    bare = re.fullmatch(r"[ \t]*(" + duration + r")[ \t]*[.!]?[ \t]*", clean, re.I)
    if bare:
        return seconds(bare.group(1))
    remaining = re.fullmatch(r"[ \t]*(" + duration + r")[ \t]+(?:remaining|left)[.!]?[ \t]*", clean, re.I)
    return seconds(remaining.group(1)) if remaining else None


class Store:
    def __init__(self, filename: str | Path, *, timing: Timing | None = None,
                 rng: random.Random | None = None):
        self.timing = timing or Timing()
        self.rng = rng if rng is not None else random.Random()
        self.db = sqlite3.connect(str(filename))
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA busy_timeout=10000")
        self.db.execute("""CREATE TABLE IF NOT EXISTS schedule (
            service_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            due_at REAL NOT NULL,
            last_attempt_at REAL,
            last_confirmed_at REAL,
            consecutive_errors INTEGER NOT NULL DEFAULT 0,
            note TEXT NOT NULL DEFAULT '',
            extra_delay_seconds INTEGER NOT NULL DEFAULT 0,
            last_observed_bumps INTEGER
        )""")
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(schedule)")}
        if "extra_delay_seconds" not in columns:
            self.db.execute("ALTER TABLE schedule ADD COLUMN extra_delay_seconds INTEGER NOT NULL DEFAULT 0")
        if "last_observed_bumps" not in columns:
            self.db.execute("ALTER TABLE schedule ADD COLUMN last_observed_bumps INTEGER")
        if "shared_due_at" not in columns:
            self.db.execute("ALTER TABLE schedule ADD COLUMN shared_due_at REAL NOT NULL DEFAULT 0")
        if "last_public_bump_at" not in columns:
            self.db.execute("ALTER TABLE schedule ADD COLUMN last_public_bump_at REAL")
        # A safe rename of legacy unknown status, without touching deadlines.
        self.db.execute("UPDATE schedule SET status='no_confirmation' WHERE status='unverified'")
        self.db.execute("""CREATE TABLE IF NOT EXISTS dispatch_clock (
            id INTEGER PRIMARY KEY CHECK(id=1),
            next_send_at REAL NOT NULL
        )""")
        self.db.execute("INSERT OR IGNORE INTO dispatch_clock(id,next_send_at) VALUES(1,0)")
        self.db.execute("""CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_id TEXT NOT NULL,
            at REAL NOT NULL,
            event TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT ''
        )""")
        self.db.execute("""CREATE TABLE IF NOT EXISTS public_observations (
            service_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            observed_at REAL NOT NULL,
            event TEXT NOT NULL,
            PRIMARY KEY(service_id, message_id)
        )""")
        self.db.commit()

    def close(self):
        self.db.close()

    def init_services(self, services: list[Service], now: float | None = None):
        now = time.time() if now is None else now
        with self.db:
            for s in services:
                row = self.db.execute("SELECT status,due_at,last_attempt_at,extra_delay_seconds FROM schedule WHERE service_id=?",
                                      (s.key,)).fetchone()
                if row is None:
                    self.db.execute("""INSERT INTO schedule(service_id,status,due_at,extra_delay_seconds)
                        VALUES(?,?,?,?)""", (s.key, "ready", now + self.rng.randint(15, 180), self._extra_delay()))
                elif row[3] == 0:
                    # Upgrade a legacy fixed timer once, never moving it earlier.
                    extra = self._extra_delay()
                    due_at = row[1]
                    if row[0] == "ready" and row[2] is None:
                        due_at = max(due_at, now + self.rng.randint(15, 180))
                    elif row[0] in {"confirmed", "cooldown", "pending", "unverified", "no_confirmation", "response_seen"}:
                        due_at += extra - 60  # Legacy versions already included 60 seconds.
                    self.db.execute("UPDATE schedule SET due_at=?,extra_delay_seconds=? WHERE service_id=?",
                                    (due_at, extra, s.key))

    def _extra_delay(self) -> int:
        return self.rng.randint(self.timing.extra_delay_min_seconds, self.timing.extra_delay_max_seconds)

    def states(self) -> list[tuple]:
        return self.db.execute("SELECT service_id,status,due_at,last_attempt_at,last_confirmed_at,consecutive_errors,note FROM schedule ORDER BY due_at").fetchall()

    def observed_bumps(self, service: Service) -> int | None:
        row = self.db.execute("SELECT last_observed_bumps FROM schedule WHERE service_id=?", (service.key,)).fetchone()
        return row[0] if row else None

    def due(self, service: Service, now: float | None = None) -> bool:
        now = time.time() if now is None else now
        next_at = self.next_attempt_at(service)
        return next_at is not None and next_at <= now

    def next_attempt_at(self, service: Service) -> float | None:
        """Earliest permitted attempt, including the shared queue's spacing."""
        row = self.db.execute("""SELECT MAX(schedule.due_at,schedule.shared_due_at,dispatch_clock.next_send_at),schedule.status
            FROM schedule CROSS JOIN dispatch_clock WHERE schedule.service_id=? AND dispatch_clock.id=1""",
            (service.key,)).fetchone()
        return row[0] if row and row[1] != "blocked" else None

    def reserve(self, service: Service, now: float | None = None) -> bool:
        """Reserve the whole cooldown *before* sending, preventing crash/restart duplicates."""
        now = time.time() if now is None else now
        with self.db:
            # Acquire the shared send slot and service reservation in one transaction.
            # This survives restarts and prevents overdue services from firing together.
            slot = self.db.execute("""UPDATE dispatch_clock SET next_send_at=? WHERE id=1 AND next_send_at<=?
                AND EXISTS(SELECT 1 FROM schedule WHERE service_id=? AND due_at<=?
                           AND shared_due_at<=? AND status!='blocked')""",
                (now + self.rng.randint(45, 150), now, service.key, now, now))
            if slot.rowcount != 1:
                return False
            extra = self._extra_delay()
            cur = self.db.execute("""UPDATE schedule SET status='pending',due_at=?,last_attempt_at=?,
                note='awaiting response',extra_delay_seconds=?
                WHERE service_id=? AND due_at<=? AND shared_due_at<=? AND status!='blocked'""",
                (now + service.cooldown_seconds + extra, now, extra, service.key, now, now))
            if cur.rowcount != 1:
                raise RuntimeError("Lost service reservation inside dispatch transaction")
            self._event(service.key, now, "attempt", "Command reserved; not a verified bump")
        return True

    def update(self, service: Service, outcome: str, note: str = "", *, now: float | None = None, retry_after: int | None = None, observed_bumps: int | None = None):
        now = time.time() if now is None else now
        note = note[:600]
        row = self.db.execute("SELECT consecutive_errors,extra_delay_seconds FROM schedule WHERE service_id=?", (service.key,)).fetchone()
        if row is None:
            raise ValueError(f"service not initialized: {service.key}")
        errors = row[0]
        extra = row[1] or self._extra_delay()
        if outcome == "confirmed":
            due_at, status, errors = now + max(service.cooldown_seconds, retry_after or 0) + extra, "confirmed", 0
        elif outcome == "cooldown":
            # If a service reports its remaining wait, honor it; do not invent an immediate retry.
            due_at, status, errors = now + max(300, retry_after or service.cooldown_seconds) + extra, "cooldown", 0
        elif outcome == "blocked":
            due_at, status = now + 365 * 86400, "blocked"
        elif outcome == "error":
            # Errors occur before a command is sent; bounded backoff.
            errors += 1
            due_at, status = now + min(3600, 300 * (2 ** min(errors - 1, 4))), "error"
        elif outcome in {"no_confirmation", "response_seen", "unverified"}:
            # No proof of success. Keep a full service cooldown; a missing reply
            # never causes an immediate retry and never clears error history.
            due_at, status = now + max(service.cooldown_seconds, retry_after or 0) + extra, (
                "no_confirmation" if outcome == "unverified" else outcome
            )
        else:
            raise ValueError(f"unknown outcome: {outcome}")
        with self.db:
            self.db.execute("""UPDATE schedule SET status=?,due_at=?,note=?,consecutive_errors=?,extra_delay_seconds=?,
                last_confirmed_at=CASE WHEN ?='confirmed' THEN ? ELSE last_confirmed_at END,
                last_observed_bumps=CASE
                    WHEN ? IS NULL THEN last_observed_bumps
                    WHEN last_observed_bumps IS NULL OR ?>last_observed_bumps THEN ?
                    ELSE last_observed_bumps END
                WHERE service_id=?""",
                (status, due_at, note, errors, extra, status, now,
                 observed_bumps, observed_bumps, observed_bumps, service.key))
            self._event(service.key, now, outcome, note)

    def record_public_bump(self, service: Service, evidence: Any, *, now: float | None = None) -> bool:
        """Persist independently verified PUBLIC evidence, without moving due earlier.

        Separate deadline prevents a pending local command/result from erasing
        another member's shared cooldown. Replaying history cannot double-count.
        """
        now = time.time() if now is None else now
        if evidence.event not in {"public_bump", "public_cooldown"}:
            raise ValueError("unsupported public observation")
        if (not 0 < evidence.observed_at <= now + 60 or
                not evidence.observed_at < evidence.hold_until <= now + 8 * 86400):
            raise ValueError("invalid public observation times")
        with self.db:
            cur = self.db.execute("""INSERT OR IGNORE INTO public_observations
                (service_id,message_id,observed_at,event) VALUES(?,?,?,?)""",
                (service.key, str(evidence.message_id), evidence.observed_at, evidence.event))
            if cur.rowcount == 0:
                return False
            changed = self.db.execute("""UPDATE schedule
                SET shared_due_at=MAX(shared_due_at,?),
                    last_public_bump_at=CASE WHEN ?='public_bump'
                        THEN MAX(COALESCE(last_public_bump_at,0),?)
                        ELSE last_public_bump_at END
                WHERE service_id=?""",
                (evidence.hold_until, evidence.event, evidence.observed_at, service.key))
            if changed.rowcount != 1:
                raise ValueError(f"service not initialized: {service.key}")
            self._event(service.key, now, evidence.event, evidence.note[:600])
        return True

    def record_connection(self, event: str, *, now: float | None = None) -> None:
        """Record connection observations without changing any service's schedule."""
        if event not in {"disconnect", "resume"}:
            raise ValueError("unknown connection event")
        now = time.time() if now is None else now
        with self.db:
            self._event("_connection", now, event, "Gateway lifecycle event")

    def _event(self, service_id: str, at: float, event: str, note: str):
        self.db.execute("INSERT INTO events(service_id,at,event,note) VALUES (?,?,?,?)",
                        (service_id, at, event, note))
