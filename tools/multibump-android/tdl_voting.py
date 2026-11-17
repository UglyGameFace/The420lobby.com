"""Official TheDiscordList vote-only integration for MultiBump.

TheDiscordList's official Discord bot (application 1522501063456985179)
accepts *member-invoked* /upvote once per server per person every 12 hours.
It does not expose a documented API for submitting server votes on behalf of
members. This integration is deliberately excluded from the bump dispatcher.
"""
from __future__ import annotations

from pathlib import Path
import re
from typing import Any

from manage import read_config, save_config

TDL_APP_ID = "1522501063456985179"
TDL_KEY = "thediscordlist"
TDL_COOLDOWN_SECONDS = 12 * 60 * 60
TDL_INVITE = (
    "https://discord.com/oauth2/authorize?"
    "client_id=1522501063456985179&permissions=3073&scope=bot%20applications.commands"
)
TDL_LISTING_CREATE = "https://thediscordlist.com/listings/create"
TDL_GUIDE = "https://thediscordlist.com/guides/upvote-your-server-from-discord"
TDL_WEBHOOK_GUIDE = "https://thediscordlist.com/guides/webhooks-for-your-listing"
ID_PATTERN = re.compile(r"^\d{15,22}$")


def configured_vote_services(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Keep vote-only services separate from slash /bump transport config."""
    services = raw.get("vote_services", [])
    if not isinstance(services, list) or len(services) > 20:
        raise ValueError("vote_services must be a list of at most 20 entries")
    seen: set[tuple[str, str]] = set()
    for item in services:
        if not isinstance(item, dict) or item.get("provider") != TDL_KEY:
            raise ValueError("Only approved TDL vote-only service is supported")
        if str(item.get("application_id")) != TDL_APP_ID:
            raise ValueError("TDL bot application ID mismatch")
        guild = str(item.get("guild_id", ""))
        if not ID_PATTERN.fullmatch(guild):
            raise ValueError("Invalid vote-only service guild_id")
        key = (TDL_KEY, guild)
        if key in seen:
            raise ValueError("Duplicate TDL vote-only service for this guild")
        seen.add(key)
        if item.get("mode") != "member_slash_command":
            raise ValueError("TDL must use a member-invoked /upvote command")
        if item.get("enabled", True) not in (True, False):
            raise ValueError("vote_services.enabled must be boolean")
    return services


def candidate_guilds(raw: dict[str, Any]) -> list[str]:
    """Offer only guilds already configured in the user's bump profiles."""
    guilds = []
    for item in raw.get("services", []):
        if not isinstance(item, dict) or item.get("enabled", True) is False:
            continue
        guild = str(item.get("guild_id", ""))
        if ID_PATTERN.fullmatch(guild) and guild not in guilds:
            guilds.append(guild)
    return guilds


def enable_tdl(path: Path, guild_id: str) -> bool:
    """Opt in without modifying any existing bump state or timers."""
    raw = read_config(path)
    guild_id = str(guild_id)
    if guild_id not in candidate_guilds(raw):
        raise ValueError("Select a guild already configured for MultiBump")
    services = configured_vote_services(raw)
    for item in services:
        if str(item["guild_id"]) == guild_id:
            if item.get("enabled", True):
                return False
            item["enabled"] = True
            save_config(path, raw)
            return True
    services.append({
        "provider": TDL_KEY,
        "guild_id": guild_id,
        "application_id": TDL_APP_ID,
        "mode": "member_slash_command",
        "enabled": True,
    })
    raw["vote_services"] = services
    save_config(path, raw)
    return True


def active_guilds(raw: dict[str, Any]) -> set[str]:
    return {str(item["guild_id"]) for item in configured_vote_services(raw)
            if item.get("enabled", True) is not False}


def setup_in_menu(path: Path) -> bool:
    """Enable the official TDL service, never submit a vote or require tokens."""
    raw = read_config(path)
    guilds = candidate_guilds(raw)
    if not guilds:
        print("Add a bump channel/server first, then enable TheDiscordList.")
        return False
    if len(guilds) == 1:
        guild = guilds[0]
        print("Using your already-configured Discord server.")
    else:
        print("Choose which server gets TheDiscordList voting:")
        for i, guild in enumerate(guilds, 1):
            print(f"{i}. Server ending {guild[-5:]}")
        choice = input("Server number [Enter = back]: ").strip()
        if not choice:
            return False
        if not choice.isdecimal() or not 1 <= int(choice) <= len(guilds):
            raise ValueError("Choose an existing server number")
        guild = guilds[int(choice) - 1]
    added = enable_tdl(path, guild)
    print("TDL vote-only support " + ("enabled." if added else "already enabled."))
    print(f"Official bot: {TDL_APP_ID}")
    print("Your members run /upvote inside this server every 12 hours.")
    print("An official TDL bot and an active server listing are both required.")
    print("Add the official bot once:", TDL_INVITE)
    print("If the server isn't listed, create/claim its listing:", TDL_LISTING_CREATE)
    print("Only a real member can cast their own vote. MultiBump does not send /upvote.")
    return added
