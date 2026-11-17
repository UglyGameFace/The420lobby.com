"""Provider-specific server-vote capabilities for configured MultiBump bots.

This is deliberately not an automated vote transport. In November 2026 none
of the six directories has an authorized, documented server-vote submission API
verified for this user. Reporting that fact is better than counting a link tap
or a slash command as a vote.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from tdl_voting import TDL_APP_ID, active_guilds, candidate_guilds

# Keys are official application IDs from the existing six-service catalog,
# not mutable display labels or guessed /vote commands.
PROVIDER_INFO: dict[str, tuple[str, str, str]] = {
    "302050872383242240": (
        "DISBOARD", "no_server_vote",
        "Bump-only integration; no server-vote feature established."
    ),
    "1028956609382199346": (
        "OneBump", "bot_vote_not_server",
        "/vote rewards votes for OneBump on Top.gg, not votes for this server."
    ),
    "1159147139960676422": (
        "Discodus", "unverified",
        "No verified free server-voting interface or authorized vote API."
    ),
    "1222548162741538938": (
        "Discadia", "manual_server_vote",
        "Free server votes exist, but no authorized submission API verified."
    ),
    "1326784586696626176": (
        "Discordify", "manual_server_vote",
        "Free 24-hour server vote requires Discord sign-in; API documentation "
        "covers BOT vote verification, not automatic SERVER vote submission."
    ),
    "678211574183362571": (
        "D-INVITES", "automation_prohibited",
        "DiscordInvites permits real user votes, but prohibits scripted votes; "
        "its webhooks report vote events, not a voting API."
    ),
}

SERVER_VOTE_CAPABILITIES = {"manual_server_vote", "automation_prohibited"}


@dataclass(frozen=True)
class VoteCapability:
    label: str
    application_id: str
    service_id: str
    mode: str
    detail: str
    enabled: bool
    guild_id: str

    @property
    def supports_auto_submit(self) -> bool:
        # Do not silently enable an unverified API or call a selfbot transport.
        return False


def discover(config: dict[str, Any]) -> list[VoteCapability]:
    """Enumerate every configured service without changing the config or DB."""
    services = config.get("services", [])
    if not isinstance(services, list):
        raise ValueError("services must be a list")
    result: list[VoteCapability] = []
    for item in services:
        if not isinstance(item, dict):
            continue
        app_id = str(item.get("application_id", ""))
        label, mode, detail = PROVIDER_INFO.get(
            app_id,
            (str(item.get("label", "Custom directory")), "unverified",
             "No documented authorized server-vote integration for this application.")
        )
        result.append(VoteCapability(
            label=str(item.get("label") or label),
            application_id=app_id,
            service_id=str(item.get("id", "")),
            mode=mode,
            detail=detail,
            enabled=item.get("enabled", True) is not False,
            guild_id=str(item.get("guild_id", "")),
        ))
    return result


def format_capabilities(config: dict[str, Any]) -> list[str]:
    """A truthful, short view even when users have no voting targets saved."""
    services = discover(config)
    lines = ["VOTING SUPPORT | YOUR BUMP SERVICES",
             "Automatic server-vote submissions: 0 supported by verified provider APIs.",
             "Bumps continue on their existing separate schedule."]
    for i, entry in enumerate(services, 1):
        state = {
            "manual_server_vote": "WEBSITE VOTE ONLY",
            "automation_prohibited": "AUTOMATED VOTES PROHIBITED",
            "bot_vote_not_server": "VOTES FOR BOT, NOT YOUR SERVER",
            "no_server_vote": "NO SERVER VOTE",
            "unverified": "SERVER VOTE UNVERIFIED",
        }.get(entry.mode, "UNSUPPORTED")
        if not entry.enabled:
            state = "DISABLED"
        lines.append(f"{i}. {entry.label} [{state}]")
        lines.append(f"   {entry.detail}")
    if not services:
        lines.append("No configured bump services yet.")
    # TDL is vote-only. Never add it to engine.load_config().services or
    # the recurring slash-command bumper; its /upvote requires a real member.
    enabled_tdl = active_guilds(config)
    if enabled_tdl:
        for guild in sorted(enabled_tdl):
            lines.append(f"{len(services)+1}. TheDiscordList [VOTE ONLY /upvote; SETUP SAVED]")
            lines.append(f"   Guild ending {guild[-5:]}; members vote every 12h. "
                         "Official bot/listing activation not remotely verified.")
    elif candidate_guilds(config):
        lines.append(f"{len(services)+1}. TheDiscordList [VOTE ONLY; AVAILABLE TO ADD]")
        lines.append(f"   Official bot {TDL_APP_ID}: /upvote from members, not auto-submit.")
    lines.append("No browser is opened and no votes are claimed by this screen.")
    return lines
