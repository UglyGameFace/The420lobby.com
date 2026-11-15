"""Read-only status/health report from the existing MultiBump SQLite state.

Never changes a due time or marks an unobserved attempt as successful.
Can be invoked from the Android menu while the service is stopped.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from pathlib import Path
import sqlite3
import time
from typing import Callable, Mapping

OUTCOMES = ("attempt", "confirmed", "cooldown", "response_seen", "no_confirmation", "blocked", "error", "public_bump", "public_cooldown")


def local_time(timestamp: float | None) -> str:
    if timestamp is None:
        return "never"
    return datetime.fromtimestamp(timestamp).astimezone().strftime("%b %d %I:%M:%S %p %Z")


def show_status(db_path: str | Path, labels: Mapping[str, str] | None = None,
                *, now: float | None = None, output: Callable[[str], None] | None = None) -> None:
    """Summarize durable local attempts and evidence; read-only SQLite connection."""
    output = print if output is None else output
    db_path = Path(db_path)
    if not db_path.is_file():
        output("Run history: none yet")
        return
    now = time.time() if now is None else now
    labels = labels or {}
    try:
        with sqlite3.connect(f"{db_path.resolve().as_uri()}?mode=ro", uri=True, timeout=3) as db:
            columns = {r[1] for r in db.execute("PRAGMA table_info(schedule)")}
            shared_column = "shared_due_at" if "shared_due_at" in columns else "0"
            seen_column = "last_public_bump_at" if "last_public_bump_at" in columns else "NULL"
            states = db.execute(f"""SELECT service_id,status,due_at,last_attempt_at,
                     last_confirmed_at,consecutive_errors,note,
                     {shared_column} AS public_due_at, {seen_column} AS last_public_bump
                     FROM schedule ORDER BY due_at""").fetchall()
            clock_exists = db.execute("""SELECT 1 FROM sqlite_master
                     WHERE type='table' AND name='dispatch_clock'""").fetchone()
            clock = db.execute("SELECT next_send_at FROM dispatch_clock WHERE id=1").fetchone() if clock_exists else None
            shared_due = clock[0] if clock else 0
            history_exists = db.execute("""SELECT 1 FROM sqlite_master
                     WHERE type='table' AND name='events'""").fetchone()
            recent: dict[str, dict[str, int]] = defaultdict(dict)
            if history_exists:
                rows = db.execute("""SELECT service_id,event,COUNT(*) FROM events
                      WHERE at >= ? GROUP BY service_id,event""", (now - 86400,)).fetchall()
                for service_id, event, count in rows:
                    recent[service_id][event] = count
    except (sqlite3.Error, OSError, OverflowError, ValueError) as exc:
        output(f"Run history unavailable: {exc}")
        return
    if not states:
        output("No saved service schedule yet.")
        return
    output("\nMULTIBUMP | LOCAL STATUS (last 24 hours)")
    total = {event: sum(counts.get(event, 0) for key, counts in recent.items()
                        if key != "_connection") for event in OUTCOMES}
    output(f"Attempts {total['attempt']} | Bot-confirmed {total['confirmed']} | "
           f"Cooldown replies {total['cooldown']} | Reply, no proof {total['response_seen']} | "
           f"No reply {total['no_confirmation']} | Blocked {total['blocked']} | "
           f"Pre-send errors {total['error']}")
    output(f"Observed public bot confirmations {total['public_bump']} | "
           f"Explicit server-wide wait messages {total['public_cooldown']}")
    output("Attempts are scheduler reservations; they are not proof of a sent command or listing.")
    for service_id, status, due_at, attempted, confirmed, errors, note, public_due_at, last_public_bump in states:
        name = labels.get(service_id, service_id)
        deadline = max(due_at, shared_due, public_due_at or 0)
        next_line = ("paused (blocked by configuration/command)" if status == "blocked" else
                     "ready now (queued when running)" if deadline <= now else
                     "next no earlier than " + local_time(deadline))
        counts = recent.get(service_id, {})
        output(f"\n{name} [{status}] | {next_line}")
        output(f"  Last attempt: {local_time(attempted)} | Last own bot confirmation: {local_time(confirmed)}")
        output(f"  Last public bump: {local_time(last_public_bump)} | "
               f"Public hold: {local_time(public_due_at) if public_due_at and public_due_at > now else 'none active'}")
        output(f"  24h: {counts.get('attempt', 0)} attempts, {counts.get('confirmed', 0)} confirmed, "
               f"{counts.get('cooldown', 0)} cooldown, "
               f"{counts.get('response_seen', 0)} reply/no proof, "
               f"{counts.get('no_confirmation', 0)} no reply")
        if counts.get('public_bump', 0) or counts.get('public_cooldown', 0):
            output(f"  24h public: {counts.get('public_bump', 0)} confirmed, "
                   f"{counts.get('public_cooldown', 0)} server-wide wait notices")
        if errors:
            output(f"  Recorded pre-send errors: {errors}")
        if note:
            output(f"  Last result: {note.replace(chr(10), ' ')[:120]}")
    connection = recent.get("_connection", {})
    if connection:
        output(f"\nConnection: {connection.get('disconnect', 0)} disconnect events, "
               f"{connection.get('resume', 0)} resume events in the last 24 hours")
