"""Discord human-account multi-service auto-bumper.

Caution: self-bots violate Discord rules. Never paste user tokens into source code.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import logging
import math
import os
from pathlib import Path
import sys
import time

from engine import Store, Timing, load_config
from response_reader import message_body, response_matches, evaluate
from command_lookup import CommandIndex
from shared_bump import public_evidence, recover_public_history
from vote_receipts import configured_webhooks, VoteNoticeLedger, observe, recover_history as recover_vote_history

log = logging.getLogger("multibump")


class PreSendError(Exception):
    """A failure that occurred before the slash-command transport was invoked."""


def readable(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def next_attempt_text(ts: float | None, *, now: float | None = None) -> str:
    if ts is None:
        return "paused (check configuration)"
    now = time.time() if now is None else now
    if ts <= now:
        return "ready now (queued)"
    hours, remaining = divmod(math.ceil(ts - now), 3600)
    minutes, seconds = divmod(remaining, 60)
    return f"{readable(ts)} (in {hours}h {minutes:02d}m {seconds:02d}s)"


def list_states(db_path: str):
    from status_view import show_status
    show_status(db_path)


async def run_bot(config, services, store, token_override: str | None = None):
    # Delayed import lets --check and --status work without the unofficial Discord library.
    import discord

    token = token_override or os.environ.get("DISCORD_TOKEN", "").strip()
    if not token:
        raise SystemExit("DISCORD_TOKEN environment variable is missing. Never commit the token to a repository.")
    client = discord.Client()
    check_seconds = int(config.get("check_interval_seconds", 30))
    confirmation_timeout = int(config.get("confirmation_timeout_seconds", 30))
    service_worker = None
    shared_sync_ready = asyncio.Event()
    sync_lock = asyncio.Lock()
    try:
        vote_rules = configured_webhooks(config)
    except ValueError as exc:
        log.warning("Vote notification observer disabled (invalid configuration): %s", exc)
        vote_rules = ()
    vote_ledger = VoteNoticeLedger(store.db) if vote_rules else None
    by_channel = {}
    for service in services:
        by_channel.setdefault(service.channel_id, []).append(service)

    command_index = CommandIndex()

    def accept_public_message(message):
        channel = getattr(message, "channel", None)
        for service in by_channel.get(getattr(channel, "id", None), []):
            evidence = public_evidence(message, service,
                self_id=getattr(getattr(client, "user", None), "id", None),
                extra_delay=store.timing.extra_delay_min_seconds)
            if evidence is None:
                continue
            if store.record_public_bump(service, evidence):
                log.info("%s: observed %s from configured directory bot; next attempt no earlier than %s",
                         service.label, evidence.event, next_attempt_text(store.next_attempt_at(service)))

    def accept_vote_notification(message):
        if not vote_ledger:
            return
        proof = observe(message, vote_rules)
        if proof and vote_ledger.record(proof):
            log.info("Observed new %s vote notification via configured Discord webhook; "
                     "does not establish which account voted or modify bump cooldowns",
                     proof.provider)

    async def reconcile_public_messages():
        async with sync_lock:
            shared_sync_ready.clear()
            try:
                summary = await recover_public_history(client, services, store,
                    self_id=getattr(getattr(client, "user", None), "id", None), logger=log)
                log.info("Public bump history: %s channels checked, %s observations, %s failures, %s possibly truncated",
                         summary["channels_checked"], summary["new_observations"],
                         summary["failures"], summary["possibly_truncated"])
                if vote_ledger:
                    vote_summary = await recover_vote_history(client, vote_rules, vote_ledger, logger=log)
                    log.info("Provider vote notifications: %s channels checked, %s new notices, %s failures, %s possibly truncated",
                             vote_summary["channels_checked"], vote_summary["new_notices"],
                             vote_summary["failures"], vote_summary["possibly_truncated"])
            finally:
                shared_sync_ready.set()

    async def invoke(service):
        try:
            channel = client.get_channel(service.channel_id)
            if channel is None:
                channel = await client.fetch_channel(service.channel_id)
            if not getattr(channel, "guild", None) or int(channel.guild.id) != service.guild_id:
                raise LookupError("channel does not belong to configured guild")
            command = await command_index.resolve(channel, service)
        except LookupError:
            raise
        except Exception as exc:
            # No slash-command attempt occurred: a bounded retry is safe.
            raise PreSendError(f"{type(exc).__name__}: {exc}") from exc
        start = datetime.now(timezone.utc)
        user_id = getattr(getattr(client, "user", None), "id", None)
        observed_before = store.observed_bumps(service)
        def check_message(msg):
            return response_matches(msg, service, start, user_id)
        def check_edit(before, after):
            return response_matches(after, service, start, user_id)
        # Listen for both new replies and delayed edits (including embed edits).
        # Register listeners before invoking the command to avoid a race.
        async def wait_message():
            return await client.wait_for("message", check=check_message, timeout=confirmation_timeout)
        async def wait_edit():
            before, after = await client.wait_for("message_edit", check=check_edit, timeout=confirmation_timeout)
            return after
        pending = {asyncio.create_task(wait_message()), asyncio.create_task(wait_edit())}
        await asyncio.sleep(0)  # allow wait_for() listeners to register first
        try:
            command_result = await command(channel, **service.options)
            # Some transports return the reply directly. Only use it when it
            # actually looks like a message from the configured response bot.
            initial = [command_result] if response_matches(command_result, service, start, user_id) else []
            deadline = asyncio.get_running_loop().time() + confirmation_timeout
            found: list[str] = []
            last_seen_count: int | None = None
            strongest_wait: int | None = None
            while True:
                if initial:
                    msg = initial.pop(0)
                else:
                    remaining = deadline - asyncio.get_running_loop().time()
                    if remaining <= 0 or not pending:
                        break
                    done, pending = await asyncio.wait(pending, timeout=remaining, return_when=asyncio.FIRST_COMPLETED)
                    if not done:
                        break
                    msg = None
                    for task in done:
                        if task.cancelled() or task.exception() is not None:
                            continue
                        candidate = task.result()
                        if msg is None:
                            msg = candidate
                        else:
                            initial.append(candidate)
                        # Replace the completed listener promptly. The other
                        # event channel remains registered throughout.
                        if task.get_coro().__name__ == 'wait_message':
                            pending.add(asyncio.create_task(wait_message()))
                        else:
                            pending.add(asyncio.create_task(wait_edit()))
                    if msg is None:
                        continue
                body = message_body(msg)
                if not body:
                    continue  # don't let an empty placeholder mask a later edit
                status, reason, wait, count = evaluate(body, service, prior_bumps=observed_before)
                if count is not None:
                    last_seen_count = max(count, last_seen_count or 0)
                if wait is not None:
                    strongest_wait = max(wait, strongest_wait or 0)
                if status in ("confirmed", "cooldown"):
                    return status, f"{reason}: {body[:360]}", wait or strongest_wait, last_seen_count
                found.append(body[:400])
            if found:
                # Text arrived, but no recognizable success proof. This must
                # never be reported as a confirmed bump.
                return "response_seen", f"No verifiable success: {found[-1][:360]}", strongest_wait, last_seen_count
            return "no_confirmation", "No visible bot confirmation (may be ephemeral); full cooldown enforced", None, last_seen_count
        finally:
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)

    async def worker_loop():
        log.info("Running %s enabled service(s), %s sec check interval", len(services), check_seconds)
        log.info("Timing: each service cooldown + %s..%s seconds extra; queued commands at least 45..150 seconds apart",
                 store.timing.extra_delay_min_seconds, store.timing.extra_delay_min_seconds)
        for service in services:
            next_at = store.next_attempt_at(service)
            log.info("%s: %s", service.label, next_attempt_text(next_at))
        while not client.is_closed():
            await client.wait_until_ready()
            await shared_sync_ready.wait()
            # Oldest stored deadline goes first; one persisted send slot per pass.
            deadlines = {row[0]: row[2] for row in store.states()}
            ordered = sorted(services, key=lambda s: deadlines.get(s.key, float("inf")))
            for service in ordered:
                if not store.due(service):
                    continue
                if not store.reserve(service):
                    continue
                log.info("Sending /%s for %s", service.command_name, service.label)
                try:
                    outcome, detail, delay, count = await invoke(service)
                except LookupError as exc:
                    outcome, detail, delay, count = "blocked", str(exc), None, None
                except PreSendError as exc:
                    outcome, detail, delay, count = "error", f"Before command invocation: {exc}", None, None
                except Exception as exc:
                    # Request may have been accepted before the failure became visible.
                    # Do not immediately retry a possibly-executed command.
                    outcome, detail, delay, count = "no_confirmation", f"Invocation uncertain: {type(exc).__name__}: {exc}", None, None
                store.update(service, outcome, detail, retry_after=delay, observed_bumps=count)
                next_at = store.next_attempt_at(service)
                next_text = next_attempt_text(next_at)
                log.info("%s => %s | %s | next attempt: %s", service.key, outcome, detail.replace("\n", " ")[:180], next_text)
                break
            await asyncio.sleep(check_seconds)

    @client.event
    async def on_disconnect():
        shared_sync_ready.clear()
        store.record_connection("disconnect")
        log.warning("Gateway disconnected; saved service deadlines remain unchanged")

    @client.event
    async def on_resumed():
        store.record_connection("resume")
        log.info("Gateway resumed; reconciling public bump confirmations before the next send")
        await reconcile_public_messages()

    @client.event
    async def on_ready():
        nonlocal service_worker
        log.info("Connected as %s (user ID %s)", client.user, client.user.id)
        await reconcile_public_messages()
        if service_worker is None or service_worker.done():
            service_worker = asyncio.create_task(worker_loop())

    @client.event
    async def on_message(message):
        accept_public_message(message)
        accept_vote_notification(message)

    @client.event
    async def on_message_edit(before, after):
        # If a bot edits an empty embed into a confirmation, creation time
        # remains authoritative and the message ID deduplicates the event.
        accept_public_message(after)
        accept_vote_notification(after)

    await client.start(token)


def main():
    parser = argparse.ArgumentParser(description="Multi-service Discord self-bumper")
    parser.add_argument("--config", default="config.json")
    parser.add_argument("--state", default="bump_state.sqlite3")
    parser.add_argument("--check", action="store_true", help="Validate configuration without logging into Discord")
    parser.add_argument("--status", action="store_true", help="Print local bump status without logging into Discord")
    parser.add_argument("--prompt-token", action="store_true", help="Ask for account credential securely in this terminal")
    parser.add_argument("--token-file", help="Read a private account credential file (never a CLI token)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if args.status:
        list_states(args.state)
        return
    config, services = load_config(args.config)
    print(f"Configuration valid: {len(services)} service(s)")
    for s in services:
        print(f"  {s.key}: /{s.command_name} app={s.application_id} cooldown={s.cooldown_seconds}s")
    if args.check:
        return
    token_override = None
    if args.token_file:
        credential = Path(args.token_file)
        if credential.is_symlink() or not credential.is_file():
            raise ValueError("Account credential must be a regular file")
        import stat
        if stat.S_IMODE(credential.stat().st_mode) != 0o600:
            raise ValueError("Credential file permissions must be 600")
        token_override = credential.read_text(encoding="utf-8").strip()
        if not token_override or "\n" in token_override or "\r" in token_override:
            raise ValueError("Account credential file is invalid")
    elif args.prompt_token and not os.environ.get("DISCORD_TOKEN"):
        import getpass
        token_override = getpass.getpass("Discord account credential (hidden): ").strip()
    store = Store(args.state, timing=Timing.from_config(config))
    try:
        store.init_services(services)
        asyncio.run(run_bot(config, services, store, token_override=token_override))
    finally:
        store.close()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, FileNotFoundError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        sys.exit(2)
