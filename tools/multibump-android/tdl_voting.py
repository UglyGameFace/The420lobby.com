"""TheDiscordList vote configuration and opt-in account scheduling.

TheDiscordList's official Discord bot (application 1522501063456985179)
accepts *member-invoked* /upvote once per server per person every 12 hours.
It does not expose a documented API for submitting server votes on behalf of
members. Vote submission is manual by default; explicitly enabled account
scheduling reuses MultiBump's existing unofficial slash-command transport.
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
        if item.get("auto_submit", False) not in (True, False):
            raise ValueError("vote_services.auto_submit must be boolean")
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
    """Enable TDL listing support without automatically casting any vote."""
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


# Deliberate opt-in for *existing* selfbot transport. This is not a TDL
# sanctioned API; it may get the Discord user account or listing sanctioned.
# Never run this from another account or bypass challenges / rate limits.
SCHEDULED_VOTE_ID_PREFIX = "vote-tdl-"


def configured_auto_vote_services(raw: dict[str, Any]) -> list:
    """Construct vote-only Service rows for the existing durable scheduler.

    The guild/channel is reused from an existing enabled bump setup. Config
    validation is offline: it never logs in, invokes a command, or changes DB.
    """
    from engine import Service
    result = []
    bump_services = raw.get("services", [])
    if not isinstance(bump_services, list):
        raise ValueError("services must be a list")
    for vote in configured_vote_services(raw):
        if vote.get("enabled", True) is False or vote.get("auto_submit", False) is not True:
            continue
        guild = str(vote["guild_id"])
        candidates = [str(item.get("channel_id", "")) for item in bump_services
                      if isinstance(item, dict) and item.get("enabled", True) is not False
                      and str(item.get("guild_id")) == guild
                      and ID_PATTERN.fullmatch(str(item.get("channel_id", "")))]
        if not candidates:
            raise ValueError("Auto-voting requires a configured, enabled bump channel in this guild")
        channel = str(vote.get("channel_id") or candidates[0])
        if channel not in candidates:
            raise ValueError("TDL auto-vote channel must be a configured bump channel in this guild")
        result.append(Service(
            key=SCHEDULED_VOTE_ID_PREFIX + guild,
            label="TDL server /upvote (unofficial account automation)",
            guild_id=int(guild), channel_id=int(channel), application_id=int(TDL_APP_ID),
            command_name="upvote", cooldown_seconds=TDL_COOLDOWN_SECONDS,
            success_patterns=(
                r"\byou(?:\s+have|'ve)?\s+upvoted\b",
                r"\byour\s+(?:up)?vote\s+(?:has\s+been\s+)?(?:counted|recorded|added)\b",
                r"\bupvote\s+(?:was\s+)?(?:successful|recorded|counted)\b",
                r"\bthanks\s+for\s+(?:your|the)\s+(?:up)?vote\b",
            ),
            cooldown_patterns=(
                r"\balready\s+(?:upvoted|voted)\b",
                r"\b(?:vote|upvote)\s+(?:is\s+)?on\s+cooldown\b",
                r"\b(?:please\s+wait|try\s+again\s+in)\b",
                r"\bnot\s+(?:publicly\s+)?listed\b",
                r"\blisting\s+(?:hidden|under\s+review)\b",
            ),
            options={},
            response_author_id=int(TDL_APP_ID),
        ))
    return result


def set_auto_submit(path: Path, guild_id: str, enabled: bool) -> bool:
    """Explicitly switch the risk-bearing selfbot invocation on or off."""
    if type(enabled) is not bool:
        raise ValueError("auto_submit requires a boolean")
    raw = read_config(path)
    entries = configured_vote_services(raw)
    vote = next((item for item in entries if str(item["guild_id"]) == str(guild_id)
                 and item.get("enabled", True) is not False), None)
    if vote is None:
        raise ValueError("First add TDL as a vote-only service (menu 8 → 1)")
    before = vote.get("auto_submit", False) is True
    if before == enabled:
        return False
    if enabled:
        trial = dict(raw, vote_services=[dict(item) for item in entries])
        trial_vote = next(item for item in trial["vote_services"]
                          if str(item["guild_id"]) == str(guild_id))
        trial_vote["auto_submit"] = True
        configured_auto_vote_services(trial)
    vote["auto_submit"] = enabled
    save_config(path, raw)
    return True


def change_auto_vote_in_menu(path: Path) -> None:
    """The owner explicitly opts into or out of the unofficial selfbot path."""
    raw = read_config(path)
    entries = [item for item in configured_vote_services(raw)
               if item.get("enabled", True) is not False]
    if not entries:
        print("First enable TDL vote-only service with option 1.")
        return
    if len(entries) == 1:
        guild = str(entries[0]["guild_id"])
        current = entries[0].get("auto_submit", False) is True
    else:
        for i, item in enumerate(entries, 1):
            print(f"{i}. Server ending {str(item['guild_id'])[-5:]}")
        choice = input("Server number [Enter = back]: ").strip()
        if not choice:
            return
        if not choice.isdecimal() or not 1 <= int(choice) <= len(entries):
            raise ValueError("Choose a listed server")
        item = entries[int(choice) - 1]
        guild, current = str(item["guild_id"]), item.get("auto_submit", False) is True
    print("\nUNOFFICIAL /upvote SCHEDULER: " + ("ON" if current else "OFF"))
    print("This uses the saved Discord human-account session, not an approved TDL API.")
    print("Discord prohibits selfbots. TDL prohibits scripted ranking activity.")
    print("This may cost the account or listing. No spoof accounts or challenges bypassed.")
    if current:
        if input("Turn OFF scheduled TDL /upvote? [y/N]: ").strip().lower() != "y":
            return
        set_auto_submit(path, guild, False)
        print("Auto-voting disabled. Restart the running MultiBump process.")
        return
    if input("Enable this risk-bearing method? Type ENABLE: ").strip() != "ENABLE":
        print("Left disabled.")
        return
    set_auto_submit(path, guild, True)
    print("Saved. Restart MultiBump. Vote uses the same command queue as bumps.")
    print("One vote attempt per 12h plus your configured extra delay; no blind retries.")


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
