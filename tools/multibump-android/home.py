"""Single-menu, phone-first interface for MultiBump.

This stays offline until the user explicitly chooses Start. No credentials are
required to configure services. A separate opt-in local credential store is available.
"""
from __future__ import annotations

import re
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from engine import Timing
from manage import (
    add, input_id, input_positive_minutes, read_catalog, read_config,
    save_config, show_services,
)

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "config.json"
STATE = ROOT / "bump_state.sqlite3"
DISCORD_HOSTS = {"discord.com", "www.discord.com", "discordapp.com", "www.discordapp.com", "canary.discord.com", "ptb.discord.com"}
ID_RE = re.compile(r"^\d{15,22}$")


def parse_channel_link(value: str) -> tuple[str, str] | None:
    """Extract guild and channel IDs from a Discord channel/message URL."""
    try:
        url = urlparse(value.strip().strip("<>"))
    except ValueError:
        return None
    if url.scheme != "https" or (url.hostname or "").lower() not in DISCORD_HOSTS:
        return None
    segments = url.path.rstrip("/").split("/")
    if len(segments) not in (4, 5) or segments[1] != "channels":
        return None
    guild_id, channel_id = segments[2:4]
    if ID_RE.fullmatch(guild_id) and ID_RE.fullmatch(channel_id):
        return guild_id, channel_id
    return None


def ask_location(raw: dict) -> tuple[str, str]:
    """A single copied Discord message/channel link replaces two ID prompts."""
    print("\nOpen your bump channel in Discord, long-press a message, then Copy Message Link.")
    print("Paste the link below. You can also paste a channel URL or type M for manual IDs.")
    previous = next((s for s in reversed(raw["services"]) if s.get("guild_id") and s.get("channel_id")), None)
    while True:
        default = "" if previous is None else "reuse"
        label = "Discord link [Enter = reuse previous server/channel]" if previous else "Discord channel/message link (or M)"
        value = input(f"{label}: ").strip()
        if not value and previous:
            return str(previous["guild_id"]), str(previous["channel_id"])
        if value.lower() in ("m", "manual"):
            guild_id = input_id("Server ID", str(previous["guild_id"]) if previous else "")
            channel_id = input_id("Channel ID", str(previous["channel_id"]) if previous else "")
            return guild_id, channel_id
        parsed = parse_channel_link(value)
        if parsed:
            return parsed
        print("That isn't a Discord message/channel link. Try a link like https://discord.com/channels/SERVER_ID/CHANNEL_ID/MESSAGE_ID")
        print("Or enter M for manual IDs.")


def parse_selection(choice: str, count: int) -> list[int]:
    """Convert a comma/space-separated list of menu indices to unique indices."""
    tokens = choice.replace(",", " ").split()
    if not tokens:
        raise ValueError("Select one or more service numbers.")
    indexes = []
    for token in tokens:
        if not token.isdecimal() or not 1 <= int(token) <= count:
            raise ValueError(f"Invalid service number: {token}")
        index = int(token) - 1
        if index not in indexes:
            indexes.append(index)
    return indexes


def quick_add(path: Path = CONFIG, catalog: dict | None = None) -> int:
    """Batch-add presets to the same channel, asking IDs only once."""
    catalog = read_catalog() if catalog is None else catalog
    raw = read_config(path)
    keys = list(catalog) + ["custom"]
    print("\nADD BUMP SERVICES")
    for index, name in enumerate(keys, 1):
        print(f" {index}. {catalog[name]['label'] if name != 'custom' else 'Other bot (custom)'}")
    print("\nSelect all you want, e.g. 1,2,3. No bot IDs needed for presets.")
    while True:
        try:
            selection = parse_selection(input("Services: "), len(keys))
            break
        except ValueError as exc:
            print(exc)
    guild_id, channel_id = ask_location(raw)
    added = []
    for index in selection:
        name = keys[index]
        entry = catalog.get(name, {})
        app_id = str(entry.get("application_id") or "")
        if any(str(service.get("guild_id")) == guild_id and str(service.get("application_id")) == app_id for service in raw["services"]):
            print(f" - {entry.get('label', name)} already exists for this server; skipping.")
            continue
        label = None
        cmd = None
        cooldown_minutes = None
        if name == "custom":
            label = input("Bot name: ").strip()
            if not label:
                print("Custom bot skipped: name was empty.")
                continue
            app_id = input_id("Bot application ID")
            cmd = input("Slash command [bump]: ").strip().lstrip("/") or "bump"
            cooldown_minutes = input_positive_minutes(None) / 60
        elif entry.get("cooldown_seconds") is None:
            print(f"{entry['label']} has no verified cooldown. Enter the value the bot reports.")
            cooldown_minutes = input_positive_minutes(None) / 60
        try:
            item = add(raw, catalog, profile=name, guild_id=guild_id, channel_id=channel_id,
                       application_id=app_id, command_name=cmd, label=label,
                       cooldown_minutes=cooldown_minutes, non_interactive=True)
            added.append(item["label"])
        except ValueError as exc:
            print(f" - Could not add {entry.get('label', label or name)}: {exc}")
    if added:
        save_config(path, raw)
        print(f"\nSaved: {', '.join(added)}")
        print("These are configured, NOT yet verified as working Discord commands.")
    else:
        print("No new services saved.")
    return len(added)


def add_requested_services(path: Path = CONFIG, catalog: dict | None = None) -> int:
    """Add the two newly requested services using the previously configured location.

    No token, link, or bot ID required for existing single-server installations.
    Existing services, cooldown history, and disabled entries are not rewritten.
    """
    catalog = read_catalog() if catalog is None else catalog
    raw = read_config(path)
    locations = {(str(s["guild_id"]), str(s["channel_id"])) for s in raw["services"]
                 if ID_RE.fullmatch(str(s.get("guild_id", "")))
                 and ID_RE.fullmatch(str(s.get("channel_id", "")))}
    if not locations:
        print("No existing bump channel found. Use option 1 to add your first service.")
        return 0
    if len(locations) == 1:
        guild_id, channel_id = next(iter(locations))
        print("Using your already-configured server and bump channel.")
    else:
        print("Multiple server/channel locations found. Choose which one should get the new services.")
        guild_id, channel_id = ask_location(raw)
    added = []
    for key in ("discordify", "d-invites"):
        entry = catalog[key]
        app_id = str(entry["application_id"])
        if any(str(s.get("guild_id")) == guild_id and str(s.get("application_id")) == app_id
               for s in raw["services"]):
            print(f" - {entry['label']} already configured. Skipping.")
            continue
        result = add(raw, catalog, profile=key, guild_id=guild_id, channel_id=channel_id,
                     non_interactive=True)
        added.append(result["label"])
    if added:
        save_config(path, raw)
        print(f"Saved: {', '.join(added)}. Restart a running bumper to apply the change.")
        print("D-INVITES: 120 minutes is provisional; check its actual cooldown after the first response.")
    else:
        print("Both services already exist. Nothing changed.")
    return len(added)


def show_status(path: Path = CONFIG, db_path: Path = STATE):
    from status_view import show_status as show_local_status
    raw = read_config(path)
    active = [s for s in raw["services"] if s.get("enabled", True)]
    print(f"\nConfigured: {len(active)} enabled service(s)")
    timing = Timing.from_config(raw)
    print(f"Timing: cooldown + {timing.extra_delay_min_seconds / 60:g}..{timing.extra_delay_max_seconds / 60:g} minutes extra")
    labels = {str(s["id"]): str(s.get("label", s["id"])) for s in raw["services"]}
    show_local_status(db_path, labels)
    from vote_tracker import show_vote_status
    show_vote_status(path, db_path)


def run_bumper(path: Path = CONFIG):
    raw = read_config(path)
    if not any(s.get("enabled", True) for s in raw["services"]):
        print("Add at least one service first (option 1).")
        return
    if not (ROOT / ".venv-debian" / "pyvenv.cfg").exists():
        print("The Debian Python setup is missing. Use 'bash install-termux.sh' once.")
        return
    print("\nStarting MultiBump v15. If opted in, your saved login will be reused.")
    print("Discord prohibits self-bots; using a human account risks account termination.")
    print("Press Ctrl+C to stop and return to this menu.\n")
    try:
        subprocess.run(["bash", str(ROOT / "run-termux.sh")], cwd=ROOT, check=False)
    except KeyboardInterrupt:
        print("\nStopped.")


def manage_login():
    from credentials import read_credential, capture_and_save, forget_credential
    print("\nACCOUNT LOGIN")
    print("Saved locally in Termux private files (not encrypted). Never shared to the ZIP.")
    print("Current status:", "Saved" if read_credential() else "Not saved")
    print("1. Save / replace login")
    print("2. Forget saved login")
    print("0. Back")
    choice = input("Choose: ").strip()
    if choice == "1":
        capture_and_save()
    elif choice == "2":
        if input("Really forget the saved login? [y/N]: ").strip().lower() in ("y", "yes"):
            forget_credential()
            print("Login forgotten. You'll be prompted at next start.")


def edit_timing(path: Path = CONFIG):
    raw = read_config(path)
    timing = Timing.from_config(raw)
    print("\nEXTRA WAIT AFTER EACH COOLDOWN")
    print("A new delay is chosen each cycle, added after the bot's required wait.")
    print("Commands are also spaced apart. Saved due times survive restarts.")
    def ask_minutes(label, current):
        value = input(f"{label} extra minutes [{current / 60:g}]: ").strip()
        if not value:
            return current
        if not value.isdecimal() or not 1 <= int(value) <= 1440:
            raise ValueError("Enter whole minutes from 1 to 1440.")
        return int(value) * 60
    low = ask_minutes("Minimum", timing.extra_delay_min_seconds)
    high = ask_minutes("Maximum", timing.extra_delay_max_seconds)
    timing = Timing(low, high)
    raw["timing"] = {"extra_delay_min_seconds": timing.extra_delay_min_seconds,
                     "extra_delay_max_seconds": timing.extra_delay_max_seconds}
    save_config(path, raw)
    print("Timing saved. Restart the bumper to use it for new cycles; existing due times are kept.")


def main() -> int:
    print("\nMULTIBUMP v15  |  EASY MODE")
    while True:
        raw = read_config(CONFIG)
        count = sum(bool(s.get("enabled", True)) for s in raw["services"])
        print(f"\n{count} bump service(s) enabled")
        print("1. Add multiple bump bots")
        print("2. START bumper")
        print("3. View status")
        print("4. Edit / remove services")
        print("5. Add Discordify + D-INVITES (reuse your bump channel)")
        print("6. Saved login (change / forget)")
        print("7. Timing (extra wait after cooldown)")
        print("8. Free directory votes (separate from bumps)")
        print("0. Exit")
        choice = input("Choose: ").strip()
        try:
            if choice == "0":
                return 0
            if choice == "1":
                quick_add()
            elif choice == "2":
                run_bumper()
            elif choice == "3":
                show_status()
            elif choice == "4":
                from manage import menu
                menu(CONFIG, read_catalog())
            elif choice == "5":
                add_requested_services()
            elif choice == "6":
                manage_login()
            elif choice == "7":
                edit_timing()
            elif choice == "8":
                from vote_tracker import menu as vote_menu
                vote_menu(CONFIG, STATE)
            else:
                print("Choose a number shown above.")
        except (OSError, ValueError) as exc:
            print(f"Could not complete this action: {exc}")
        except (KeyboardInterrupt, EOFError):
            print("\nBack to menu.")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyboardInterrupt, EOFError):
        print("\nExited.")
