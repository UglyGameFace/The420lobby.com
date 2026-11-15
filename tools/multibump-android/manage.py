"""Termux-friendly MultiBump service manager.

Add/edit/list/disable services without touching program source or exposing tokens.
No Discord connection is required for configuration.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from typing import Any

from engine import load_config

ROOT = Path(__file__).resolve().parent
CATALOG = ROOT / "service_catalog.json"
COMMON_SUCCESS = ["successfully bumped", "bumped successfully", "bump successful", "bump done"]
COMMON_COOLDOWN = ["cooldown", "try again", "please wait", "already bumped", "can bump again"]
DEFAULT_CONFIG = {"check_interval_seconds": 30, "confirmation_timeout_seconds": 30, "services": []}
ID_RE = re.compile(r"^\d{15,22}$")
NAME_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")
CMD_RE = re.compile(r"^[a-z0-9_-]+(?: [a-z0-9_-]+){0,2}$")


def read_catalog() -> dict[str, dict[str, Any]]:
    raw = json.loads(CATALOG.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("service_catalog.json must contain an object")
    return raw


def read_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        return json.loads(json.dumps(DEFAULT_CONFIG))
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(raw.get("services"), list):
        raise ValueError(f"{path}: expected a 'services' array")
    return raw


def validate_service(service: dict[str, Any]) -> None:
    key = str(service.get("id", ""))
    if not NAME_RE.fullmatch(key):
        raise ValueError("Service id must start with a letter and contain only lowercase letters, digits, '_' or '-'")
    for field in ("guild_id", "channel_id", "application_id", "response_author_id"):
        val = service.get(field)
        if val is not None and not ID_RE.fullmatch(str(val)):
            raise ValueError(f"{field} must be a 15–22 digit Discord numeric ID")
    if not CMD_RE.fullmatch(str(service.get("command_name", "")).strip().lstrip("/")):
        raise ValueError("command_name must be a slash command name, e.g. 'bump' or 'server bump'")
    cooldown = service.get("cooldown_seconds")
    if not isinstance(cooldown, int) or not 300 <= cooldown <= 604800:
        raise ValueError("cooldown must be between 5 minutes and 7 days")
    for field in ("success_patterns", "cooldown_patterns"):
        patterns = service.get(field)
        if not isinstance(patterns, list) or not patterns or not all(isinstance(x, str) for x in patterns):
            raise ValueError(f"{field} must be a nonempty list of patterns")
        for pattern in patterns:
            re.compile(pattern, re.I)
    if not isinstance(service.get("options"), dict):
        raise ValueError("options must be an object")


def validate_config(raw: dict[str, Any]) -> None:
    ids: set[str] = set()
    by_guild_app: set[tuple[str, str]] = set()
    for entry in raw["services"]:
        # Legacy disabled placeholders are harmless; do not modify them or block editing.
        if not entry.get("enabled", True):
            continue
        validate_service(entry)
        key = entry["id"]
        if key in ids:
            raise ValueError(f"Duplicate enabled service ID: {key}")
        ids.add(key)
        pair = (str(entry["guild_id"]), str(entry["application_id"]))
        if pair in by_guild_app:
            raise ValueError(f"An enabled service for application {pair[1]} already exists in guild {pair[0]}")
        by_guild_app.add(pair)


def save_config(path: Path, raw: dict[str, Any]) -> None:
    validate_config(raw)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    tmp = Path(name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(raw, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(tmp, 0o600)
        if any(s.get("enabled", True) for s in raw["services"]):
            load_config(tmp)
        if path.exists():
            backup = path.with_name(path.name + ".bak")
            shutil.copy2(path, backup)
            os.chmod(backup, 0o600)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def input_default(prompt: str, default: str = "", *, required: bool = True) -> str:
    while True:
        suffix = f" [{default}]" if default else ""
        answer = input(f"{prompt}{suffix}: ").strip() or default
        if answer or not required:
            return answer
        print("  This field is required.")


def input_positive_minutes(default_seconds: int | None) -> int:
    default = str(default_seconds // 60) if default_seconds else ""
    while True:
        raw = input_default("Cooldown in minutes (from the bump bot)", default)
        try:
            minutes = float(raw)
            seconds = round(minutes * 60)
            if 300 <= seconds <= 604800:
                return seconds
        except ValueError:
            pass
        print("  Enter 5 to 10080 minutes, e.g. 120 or 1440.")


def input_id(prompt: str, default: str = "") -> str:
    while True:
        raw = input_default(prompt, default)
        if ID_RE.fullmatch(raw):
            return raw
        print("  Enter a copied Discord ID, not a channel name or invite link. Enable Developer Mode in Discord.")


def choose_from_list(options: list[str], prompt: str) -> str:
    for i, name in enumerate(options, 1):
        print(f"  {i}. {name}")
    while True:
        raw = input_default(prompt)
        if raw in options:
            return raw
        if raw.isdecimal() and 1 <= int(raw) <= len(options):
            return options[int(raw)-1]
        print("  Choose an option number or profile name.")


def existing_default(raw: dict[str, Any], field: str) -> str:
    entries = [str(s.get(field)) for s in raw["services"] if ID_RE.fullmatch(str(s.get(field, "")))]
    return entries[-1] if entries else ""


def slug(text: str) -> str:
    return re.sub("-+", "-", re.sub("[^a-z0-9]+", "-", text.lower())).strip("-")[:45] or "custom"


def unique_key(raw: dict[str, Any], profile: str, guild: str) -> str:
    root = f"{slug(profile)}-{guild[-6:]}"
    names = {str(s.get("id")) for s in raw["services"]}
    if root not in names:
        return root
    for n in range(2, 10000):
        candidate = f"{root}-{n}"
        if candidate not in names:
            return candidate
    raise ValueError("Too many duplicate service IDs")


def add(raw: dict[str, Any], catalog: dict[str, Any], *, profile: str | None = None,
        guild_id: str | None = None, channel_id: str | None = None,
        application_id: str | None = None, command_name: str | None = None,
        cooldown_minutes: float | None = None, label: str | None = None,
        non_interactive: bool = False) -> dict[str, Any]:
    options = list(catalog) + ["custom"]
    if profile is None:
        if non_interactive:
            raise ValueError("Provide a profile name in non-interactive mode")
        profile = choose_from_list(options, "Select a listing service")
    profile = profile.lower().strip()
    if profile not in options:
        raise ValueError(f"Unknown service {profile!r}. Use 'custom' or pick: {', '.join(options)}")
    item = catalog.get(profile, {})
    if not non_interactive:
        print(f"\nAdding {item.get('label', 'Custom bump service')}")
        if item.get("evidence"):
            print(f"  Note: {item['evidence']}")
        if item.get("help_url"):
            print(f"  Details: {item['help_url']}")
        print("  Android: Discord Settings > Advanced > Developer Mode, then Copy Server/Channel ID.\n")
    if not label:
        label = str(item.get("label", ""))
        if not label:
            if non_interactive:
                raise ValueError("Custom service requires --name")
            label = input_default("Service name")
    if not guild_id:
        if non_interactive:
            raise ValueError("Provide --guild-id")
        guild_id = input_id("Server ID", existing_default(raw, "guild_id"))
    if not channel_id:
        if non_interactive:
            raise ValueError("Provide --channel-id")
        channel_id = input_id("Bump channel ID", existing_default(raw, "channel_id"))
    if not application_id:
        application_id = str(item.get("application_id") or "")
        if not non_interactive:
            application_id = input_id("Bump bot application ID (verify in Discord)", application_id)
        elif not application_id:
            raise ValueError("Custom service requires --app-id")
    if not command_name:
        command_name = str(item.get("command_name") or "bump")
        if not non_interactive:
            command_name = input_default("Slash command (without /)", command_name).lstrip("/")
    if cooldown_minutes is None:
        if non_interactive:
            base = item.get("cooldown_seconds")
            if base is None:
                raise ValueError(f"{profile} has no verified cooldown; supply --cooldown-minutes")
            cooldown_seconds = int(base)
        else:
            cooldown_seconds = input_positive_minutes(item.get("cooldown_seconds"))
    else:
        cooldown_seconds = round(float(cooldown_minutes) * 60)
    application_id, guild_id, channel_id = map(str, (application_id, guild_id, channel_id))
    for s in raw["services"]:
        if str(s.get("guild_id")) == guild_id and str(s.get("application_id")) == application_id:
            raise ValueError(f"{label} already exists in this server as {s.get('id')}. Use edit instead.")
    service = {
        "id": unique_key(raw, profile if profile != "custom" else label, guild_id),
        "label": label,
        "enabled": True,
        "guild_id": guild_id,
        "channel_id": channel_id,
        "application_id": application_id,
        "command_name": command_name.strip().lstrip("/"),
        "cooldown_seconds": cooldown_seconds,
        "options": {},
        "success_patterns": list(item.get("success_patterns", COMMON_SUCCESS)),
        "cooldown_patterns": list(item.get("cooldown_patterns", COMMON_COOLDOWN)),
    }
    validate_service(service)
    raw["services"].append(service)
    return service


def get_service(raw: dict[str, Any], key: str) -> dict[str, Any]:
    for item in raw["services"]:
        if item.get("id") == key:
            return item
    raise ValueError(f"Unknown service ID {key!r}. Use 'python manage.py list'.")


def show_services(raw: dict[str, Any]) -> None:
    if not raw["services"]:
        print("No services configured. Run 'python manage.py add' to begin.")
        return
    for s in raw["services"]:
        state = "ON " if s.get("enabled", True) else "OFF"
        raw_cd = s.get("cooldown_seconds")
        cd = f"{int(raw_cd)//60}m" if isinstance(raw_cd, int) else "needs setup"
        print(f"{state}  {str(s.get('id','?')):<28}  {s.get('label','?')} | /{s.get('command_name','?')} | {cd} | server {s.get('guild_id','?')} | channel {s.get('channel_id','?')}")


def edit_service(s: dict[str, Any], args: argparse.Namespace, interactive: bool) -> None:
    if not interactive:
        updated = False
        for key, val in (
            ("guild_id", args.guild_id), ("channel_id", args.channel_id),
            ("application_id", args.app_id), ("command_name", args.command), ("label", args.name)
        ):
            if val is not None:
                s[key] = str(val)
                updated = True
        if args.cooldown_minutes is not None:
            s["cooldown_seconds"] = round(args.cooldown_minutes * 60)
            updated = True
        if not updated:
            raise ValueError("Nothing to edit; supply e.g. --channel-id or --cooldown-minutes")
    else:
        fields = (
            ("label", "Label"), ("guild_id", "Server ID"), ("channel_id", "Channel ID"),
            ("application_id", "Bot application ID"), ("command_name", "Slash command (without /)")
        )
        for key, title in fields:
            s[key] = input_default(title, str(s.get(key, "")))
        s["cooldown_seconds"] = input_positive_minutes(s.get("cooldown_seconds"))
    validate_service(s)


def menu(path: Path, catalog: dict[str, Any]) -> None:
    while True:
        raw = read_config(path)
        print("\nMultiBump Service Manager")
        show_services(raw)
        print("\n1. Add service   2. Edit service   3. Enable/disable   4. Remove   5. Show catalog   0. Exit")
        choice = input("Choose: ").strip()
        try:
            if choice == "0":
                return
            if choice == "5":
                for name, entry in catalog.items():
                    cd = entry.get("cooldown_seconds")
                    print(f"  {name}: {entry['label']} | {f'{cd//60}m' if cd else 'cooldown to confirm'}")
                print("  custom: any other slash-command bump bot")
                continue
            if choice == "1":
                result = add(raw, catalog)
                save_config(path, raw)
                print(f"Added {result['label']} ({result['id']}). Restart the running bumper to apply changes.")
            elif choice == "2":
                target = input_default("Service ID to edit")
                edit_service(get_service(raw, target), argparse.Namespace(), True)
                save_config(path, raw)
                print("Saved. Restart the running bumper to apply changes.")
            elif choice == "3":
                target = input_default("Service ID to toggle")
                service = get_service(raw, target)
                service["enabled"] = not service.get("enabled", True)
                save_config(path, raw)
                print(f"{target}: {'enabled' if service['enabled'] else 'disabled'}. Restart the bumper.")
            elif choice == "4":
                target = input_default("Service ID to remove")
                get_service(raw, target)
                if input_default(f"Type REMOVE to delete {target}", required=False) == "REMOVE":
                    raw["services"] = [s for s in raw["services"] if s.get("id") != target]
                    save_config(path, raw)
                    print("Removed from configuration. Historical SQLite records are preserved.")
                else:
                    print("Cancelled.")
            else:
                print("Unknown choice.")
        except (ValueError, OSError) as exc:
            print(f"Cannot apply change: {exc}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Add/manage bump bots without editing source files")
    p.add_argument("--config", default="config.json", help="JSON configuration file (default: config.json)")
    sub = p.add_subparsers(dest="action")
    sub.add_parser("list", help="List enabled/disabled services")
    sub.add_parser("catalog", help="Show available bot presets")
    add_parser = sub.add_parser("add", help="Add Discodus, Discadia, DISBOARD, OneBump, or a custom bot")
    add_parser.add_argument("profile", nargs="?", help="Preset name or custom")
    edit_parser = sub.add_parser("edit", help="Update a service by ID (prompts if no fields supplied)")
    edit_parser.add_argument("id")
    for parser in (add_parser, edit_parser):
        parser.add_argument("--guild-id")
        parser.add_argument("--channel-id")
        parser.add_argument("--app-id")
        parser.add_argument("--command")
        parser.add_argument("--cooldown-minutes", type=float)
        parser.add_argument("--name")
    add_parser.add_argument("--yes", action="store_true", help="Noninteractive, requires --guild-id and --channel-id")
    sub.add_parser("disable", help="Disable a service").add_argument("id")
    sub.add_parser("enable", help="Enable a service").add_argument("id")
    sub.add_parser("remove", help="Remove a service, preserving SQLite history").add_argument("id")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    path = Path(args.config)
    catalog = read_catalog()
    if args.action is None:
        menu(path, catalog)
        return 0
    if args.action == "catalog":
        for key, entry in catalog.items():
            cd = entry.get("cooldown_seconds")
            print(f"{key:12} /{entry['command_name']:<14} {f'{cd//60}m' if cd else 'confirm cooldown':<18} app={entry['application_id']}")
        print("custom       add any other slash-command bump bot")
        return 0
    raw = read_config(path)
    if args.action == "list":
        show_services(raw)
        return 0
    if args.action == "add":
        s = add(raw, catalog, profile=args.profile, guild_id=args.guild_id, channel_id=args.channel_id,
                application_id=args.app_id, command_name=args.command,
                cooldown_minutes=args.cooldown_minutes, label=args.name, non_interactive=args.yes)
        save_config(path, raw)
        print(f"Added {s['label']} as {s['id']}. Restart the bumper to use it.")
    elif args.action == "edit":
        s = get_service(raw, args.id)
        interactive = all(v is None for v in (args.guild_id, args.channel_id, args.app_id, args.command, args.cooldown_minutes, args.name))
        edit_service(s, args, interactive)
        save_config(path, raw)
        print(f"Updated {s['id']}. Restart the bumper to use it.")
    elif args.action in ("disable", "enable"):
        s = get_service(raw, args.id)
        s["enabled"] = args.action == "enable"
        save_config(path, raw)
        print(f"{s['id']}: {'enabled' if s['enabled'] else 'disabled'}. Restart the bumper.")
    elif args.action == "remove":
        get_service(raw, args.id)
        raw["services"] = [s for s in raw["services"] if s.get("id") != args.id]
        save_config(path, raw)
        print(f"Removed {args.id} from config. Historical state remains in SQLite.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        sys.exit(2)
    except (KeyboardInterrupt, EOFError):
        print("\nCancelled.", file=sys.stderr)
        sys.exit(130)
