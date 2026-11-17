"""Phone-first free directory voting companion for MultiBump.

Only opens official listing pages. Authentication and vote submission stay with
the directory; the user must explicitly record a successful vote. This module
never attempts to automate a Discord user account or claim website verification.
"""
from __future__ import annotations

from datetime import datetime
from contextlib import closing
import getpass
import ipaddress
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import time
from urllib.parse import urlsplit

from manage import read_config, save_config
from vote_capabilities import format_capabilities
from vote_receipts import configured_webhooks, recent_count

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "config.json"
STATE = ROOT / "bump_state.sqlite3"
DAY = 86400
PROVIDERS = {
    "discordify": ("Discordify", "discordify.net"),
    "discadia": ("Discadia", "discadia.com"),
}
# The 420 Lobby's public listing, supplied by the owner. Other directories
# require the owner to paste their own real server listing URL.
DISCORDIFY_LOBBY = "https://discordify.net/server/the-420-lobby"
PROVIDER_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
HOST_RE = re.compile(r"^[a-z0-9.-]+$")


def validate_url(provider: str, url: str) -> str:
    """Accept a real HTTPS listing link, not a login/token/redirect endpoint."""
    if not PROVIDER_RE.fullmatch(provider) or not isinstance(url, str):
        raise ValueError("Invalid vote provider or link.")
    if len(url) > 700 or not url or any(ch.isspace() for ch in url):
        raise ValueError("Paste a single HTTPS directory listing URL.")
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower()
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Invalid vote listing URL.") from exc
    if (parsed.scheme != "https" or not host or not HOST_RE.fullmatch(host)
            or parsed.username or parsed.password or port is not None
            or parsed.fragment or not parsed.path.startswith("/")
            or parsed.path == "/" or host.startswith(".") or host.endswith(".")
            or ".." in host):
        raise ValueError("Use the public HTTPS server listing, without logins or fragments.")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError("Vote links must use a public directory hostname.")
    if host in {"localhost", "local"} or "." not in host:
        raise ValueError("Vote links must use a public directory hostname.")
    if provider in PROVIDERS:
        expected = PROVIDERS[provider][1]
        if host not in {expected, "www." + expected}:
            raise ValueError(f"{PROVIDERS[provider][0]} link must be on {expected}.")
        if provider == "discordify" and not parsed.path.startswith("/server/"):
            raise ValueError("Use the Discordify server listing, not its bot or OAuth page.")
    return url


def configured_targets(raw: dict) -> list[dict]:
    targets = raw.get("vote_targets", [])
    if not isinstance(targets, list):
        raise ValueError("vote_targets must be a list.")
    for target in targets:
        if not isinstance(target, dict):
            raise ValueError("Invalid vote target entry.")
        provider = str(target.get("provider", ""))
        validate_url(provider, target.get("url"))
        cooldown = target.get("cooldown_seconds")
        if type(cooldown) is not int or not DAY <= cooldown <= 7 * DAY:
            raise ValueError("Vote cooldown must be 24 hours to 7 days.")
    return targets


def add_target(path: Path, provider: str, label: str, url: str,
               *, cooldown_seconds: int = DAY) -> bool:
    """Idempotently save a free voting target without rewriting bump services."""
    url = validate_url(provider, url)
    if type(cooldown_seconds) is not int or not DAY <= cooldown_seconds <= 7 * DAY:
        raise ValueError("Vote cooldown must be at least 24 hours.")
    label = label.strip()
    if not 2 <= len(label) <= 70:
        raise ValueError("Enter a short directory name.")
    raw = read_config(path)
    targets = configured_targets(raw)
    if any(t["provider"] == provider and t["url"] == url for t in targets):
        return False
    targets.append({"provider": provider, "label": label, "url": url,
                    "cooldown_seconds": cooldown_seconds})
    raw["vote_targets"] = targets
    save_config(path, raw)
    return True


def remove_target(path: Path, index: int) -> None:
    raw = read_config(path)
    targets = configured_targets(raw)
    if not 0 <= index < len(targets):
        raise ValueError("Invalid vote target number.")
    del targets[index]
    raw["vote_targets"] = targets
    save_config(path, raw)


class VoteLedger:
    """One persistent eligibility clock per provider/account, across listings.

    A vote on one Discordify server consumes the account's one daily vote for
    the entire directory. This clock is separate from bump schedules and queue.
    """

    def __init__(self, db_path: Path):
        self.db = sqlite3.connect(str(db_path), timeout=10)
        self.db.execute("PRAGMA busy_timeout=10000")
        with self.db:
            self.db.execute("""CREATE TABLE IF NOT EXISTS vote_state (
                provider TEXT PRIMARY KEY,
                due_at REAL NOT NULL,
                last_self_reported_at REAL NOT NULL,
                last_target_url TEXT NOT NULL
            )""")
            self.db.execute("""CREATE TABLE IF NOT EXISTS vote_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                target_url TEXT NOT NULL,
                recorded_at REAL NOT NULL,
                event TEXT NOT NULL
            )""")

    def close(self) -> None:
        self.db.close()

    def state(self, provider: str) -> tuple[float, float] | None:
        row = self.db.execute("SELECT last_self_reported_at,due_at FROM vote_state WHERE provider=?",
                              (provider,)).fetchone()
        return (row[0], row[1]) if row else None

    def record_self_report(self, target: dict, *, now: float | None = None) -> float:
        """Record only after the user saw a website success confirmation."""
        provider = target["provider"]
        url = validate_url(provider, target["url"])
        cooldown = target["cooldown_seconds"]
        if type(cooldown) is not int or not DAY <= cooldown <= 7 * DAY:
            raise ValueError("Invalid vote cooldown.")
        now = time.time() if now is None else now
        with self.db:
            # Lock before reading eligibility: two Termux sessions must not
            # both record the same directory/account vote at once.
            self.db.execute("BEGIN IMMEDIATE")
            previous = self.state(provider)
            if previous and previous[1] > now:
                raise ValueError("This account's next vote is not eligible yet.")
            due = now + cooldown
            self.db.execute("""INSERT INTO vote_state
                (provider,due_at,last_self_reported_at,last_target_url)
                VALUES(?,?,?,?)
                ON CONFLICT(provider) DO UPDATE SET
                due_at=excluded.due_at,last_self_reported_at=excluded.last_self_reported_at,
                last_target_url=excluded.last_target_url""", (provider, due, now, url))
            self.db.execute("""INSERT INTO vote_events
                (provider,target_url,recorded_at,event) VALUES(?,?,?,'self_reported')""",
                (provider, url, now))
        return due


def read_states(db_path: Path) -> dict[str, tuple[float, float]]:
    """Status is read-only and must not initialize or change bump SQLite."""
    if not db_path.is_file():
        return {}
    try:
        with closing(sqlite3.connect(f"{db_path.resolve().as_uri()}?mode=ro", uri=True, timeout=3)) as db:
            table = db.execute("""SELECT 1 FROM sqlite_master
                WHERE type='table' AND name='vote_state'""").fetchone()
            if not table:
                return {}
            return {row[0]: (row[1], row[2]) for row in db.execute(
                "SELECT provider,last_self_reported_at,due_at FROM vote_state")}
    except (sqlite3.Error, OSError):
        return {}


def display_time(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp).astimezone().strftime("%b %d %I:%M %p %Z")


def show_vote_status(config_path: Path = CONFIG, db_path: Path = STATE) -> None:
    raw = read_config(config_path)
    for line in format_capabilities(raw):
        print(line)
    notices = recent_count(db_path)
    print(f"\nD-INVITES provider vote notices in last 24h: {notices.get('d-invites', 0)}")
    print("Trusted Discord webhook notices do not establish which account voted.")
    targets = configured_targets(raw)
    print("\nOPTIONAL MANUAL VOTE HISTORY (SELF-REPORTED, NOT VERIFIED)")
    if not targets:
        print("Manual votes not recorded; this does not mean voting is available.")
        return
    states = read_states(db_path)
    now = time.time()
    for i, target in enumerate(targets, 1):
        state = states.get(target["provider"])
        if not state:
            detail = "not recorded; check the website before voting"
        elif state[1] <= now:
            detail = f"eligible now (last self-reported {display_time(state[0])})"
        else:
            detail = f"next eligible {display_time(state[1])} (last self-reported)"
        print(f" {i}. {target['label']}: {detail}")
        print(f"    {target['url']}")
    print("Only your own confirmation is stored; opening a page is NOT a successful vote.")


def open_link(url: str, provider: str) -> bool:
    url = validate_url(provider, url)
    print(f"Official voting page: {url}")
    command = shutil.which("termux-open-url")
    if command:
        try:
            subprocess.run([command, url], check=True, timeout=10)
            return True
        except (OSError, subprocess.SubprocessError):
            print("Could not launch Android browser. Open the URL printed above.")
    else:
        print("Open the URL above in your phone browser.")
    return False


def choose_target(targets: list[dict]) -> int | None:
    if not targets:
        print("Add a voting target first.")
        return None
    for i, target in enumerate(targets, 1):
        print(f" {i}. {target['label']} ({target['provider']})")
    choice = input("Target number [Enter = back]: ").strip()
    if not choice:
        return None
    if not choice.isdecimal() or not 1 <= int(choice) <= len(targets):
        raise ValueError("Choose a target number shown above.")
    return int(choice) - 1


def add_interactive(config_path: Path) -> None:
    print("\n1. Discordify (24h free vote)")
    print("2. Discadia (24h free vote)")
    print("3. Other directory (paste a verified free voting link)")
    choice = input("Directory [Enter = back]: ").strip()
    if not choice:
        return
    if choice == "1":
        provider, label, default_url = "discordify", "Discordify", DISCORDIFY_LOBBY
    elif choice == "2":
        provider, label, default_url = "discadia", "Discadia", ""
    elif choice == "3":
        label = input("Directory name: ").strip()
        default_url = ""
        provider = ""
    else:
        raise ValueError("Select 1, 2, or 3.")
    prompt = "Server voting URL"
    if default_url:
        prompt += f" [Enter = {default_url}]"
    url = input(prompt + ": ").strip() or default_url
    if choice == "3":
        parsed = urlsplit(url)
        host = (parsed.hostname or "").lower()
        provider = re.sub(r"[^a-z0-9-]", "-", host).strip("-")[:64]
    cooldown = DAY
    if choice == "3":
        response = input("Free-account cooldown in hours [24]: ").strip()
        if response:
            if not response.isdecimal() or not 24 <= int(response) <= 168:
                raise ValueError("Cooldown must be 24 to 168 hours.")
            cooldown = int(response) * 3600
    if add_target(config_path, provider, label, url, cooldown_seconds=cooldown):
        print("Added. No login/token needed here; the website handles its own sign-in.")
    else:
        print("This exact voting listing is already configured.")


def quick_targets(config_path: Path) -> list[dict]:
    """Put the owner's ready-made listing first; don't modify config on view."""
    targets = configured_targets(read_config(config_path))
    default = {
        "provider": "discordify", "label": "The 420 Lobby on Discordify",
        "url": DISCORDIFY_LOBBY, "cooldown_seconds": DAY,
    }
    return [next((entry for entry in targets if entry["provider"] == "discordify"
                  and entry["url"] == DISCORDIFY_LOBBY), default)] + [
                      entry for entry in targets
                      if not (entry["provider"] == "discordify"
                              and entry["url"] == DISCORDIFY_LOBBY)
                  ]


def short_status(target: dict, states: dict, now: float) -> str:
    """A self-reported timer, never a claim about the website's real state."""
    state = states.get(target["provider"])
    if state is None:
        return "CHECK ON WEBSITE"
    if state[1] <= now:
        return "READY TO CHECK"
    return f"NEXT CHECK {display_time(state[1])}"


def vote_once(target: dict, config_path: Path, db_path: Path, *,
              now: float | None = None) -> None:
    """One action opens the listing and asks about the website result.

    We do not submit, infer or simulate a vote. The user can return from the
    Android browser to this still-running prompt when ready.
    """
    now = time.time() if now is None else now
    state = read_states(db_path).get(target["provider"])
    if state and state[1] > now:
        print(f"\nAlready recorded here. Check again after {display_time(state[1])}.")
        print("This is your local timer; the directory determines actual eligibility.")
        return

    # The main Lobby Discordify target is already known. The first tap saves
    # it once; no URL entry, bot ID, account token or setup wizard needed.
    add_target(config_path, target["provider"], target["label"], target["url"],
               cooldown_seconds=target["cooldown_seconds"])
    print(f"\nOpening {target['label']}...")
    open_link(target["url"], target["provider"])
    print("On the website, sign in if asked and tap Vote Now.")
    print("Return to Termux only after the website shows your vote succeeded.")
    answer = input("Website said your vote SUCCEEDED? [y/N]: ").strip().lower()
    if answer not in ("y", "yes"):
        print("Not recorded. You can check again whenever you want.")
        return
    ledger = VoteLedger(db_path)
    try:
        due = ledger.record_self_report(target)
    finally:
        ledger.close()
    print(f"Vote recorded (your confirmation). Next check {display_time(due)}.")
    print("No bump cooldowns or commands were changed.")


def manual_menu(config_path: Path = CONFIG, db_path: Path = STATE) -> None:
    """Optional old manual listing workflow, never called automatically."""
    while True:
        targets = quick_targets(config_path)
        states = read_states(db_path)
        now = time.time()
        print("\nTHE 420 LOBBY | FREE VOTES")
        print("Tap a number to open its website and vote.")
        for number, target in enumerate(targets, 1):
            print(f"{number}. {target['label']}  [{short_status(target, states, now)}]")
        add_number = len(targets) + 1
        remove_number = add_number + 1
        print(f"{add_number}. Add another free voting website")
        print(f"{remove_number}. Remove a saved voting website")
        print("0. Back to bumps")
        choice = input("Choose [Enter = Discordify]: ").strip() or "1"
        if choice == "0":
            return
        try:
            if choice == str(add_number):
                add_interactive(config_path)
            elif choice == str(remove_number):
                saved = configured_targets(read_config(config_path))
                index = choose_target(saved)
                if index is not None and input("Remove this link? [y/N]: ").strip().lower() == "y":
                    remove_target(config_path, index)
                    print("Saved link removed. Vote history and bump settings remain.")
            elif choice.isdecimal() and 1 <= int(choice) <= len(targets):
                vote_once(targets[int(choice) - 1], config_path, db_path)
            else:
                print("Choose one of the numbers shown.")
        except (OSError, ValueError, sqlite3.Error) as exc:
            print(f"Could not complete this voting action: {exc}")

def parse_discord_webhook_id(secret_url: str) -> str:
    """Extract only the webhook ID. Never persist or print its token."""
    if not isinstance(secret_url, str) or len(secret_url) > 400:
        raise ValueError("Invalid Discord webhook URL.")
    url = urlsplit(secret_url.strip())
    if (url.scheme != "https" or url.hostname not in {"discord.com", "discordapp.com"}
            or url.username or url.password or url.port is not None
            or url.query or url.fragment):
        raise ValueError("Paste a normal private Discord webhook URL.")
    matched = re.fullmatch(
        r"/api(?:/v\d{1,2})?/webhooks/(\d{15,22})/[A-Za-z0-9._-]{20,}",
        url.path)
    if not matched:
        raise ValueError("Expected Discord webhook URL with an ID and token.")
    return matched.group(1)


def setup_discordinvites_notifications(config_path: Path = CONFIG) -> bool:
    """A one-time receipt setup; no webhook token enters config or source."""
    raw = read_config(config_path)
    services = [item for item in raw["services"] if item.get("enabled", True) is not False
                and str(item.get("application_id")) == "678211574183362571"]
    if not services:
        print("D-INVITES is not configured as a bump service yet.")
        return False
    print("\nCONNECT OFFICIAL D-INVITES VOTE NOTIFICATIONS")
    print("In DiscordInvites server settings, enable the New Vote webhook event.")
    print("Use a Discord webhook in a private staff channel. Keep the URL secret.")
    print("Set its custom notification text to: The 420 Lobby received a new vote")
    if len(services) == 1:
        chosen = services[0]
    else:
        for index, item in enumerate(services, 1):
            print(f"{index}. {item['label']} (guild {str(item['guild_id'])[-5:]})")
        answer = input("Server number [Enter = back]: ").strip()
        if not answer:
            return False
        if not answer.isdecimal() or not 1 <= int(answer) <= len(services):
            raise ValueError("Select an existing D-INVITES server.")
        chosen = services[int(answer) - 1]
    # Default to the existing bump channel. Allow a different channel by
    # pasting one Discord message link, never raw IDs or bot tokens.
    from home import parse_channel_link
    link = input("Notification channel message link [Enter = bump channel]: ").strip()
    guild_id, channel_id = str(chosen["guild_id"]), str(chosen["channel_id"])
    if link:
        location = parse_channel_link(link)
        if location is None or location[0] != guild_id:
            raise ValueError("Link must be from the selected Discord server.")
        channel_id = location[1]
    secret_url = getpass.getpass("Private Discord webhook URL (hidden; never saved): ")
    webhook_id = parse_discord_webhook_id(secret_url)
    # Deliberately no token in the persisted record.
    rules = raw.setdefault("vote_notifications", [])
    if not isinstance(rules, list):
        raise ValueError("vote_notifications must be a list.")
    entry = {
        "provider": "d-invites", "guild_id": guild_id,
        "channel_id": channel_id, "webhook_id": webhook_id,
        "vote_phrase": "The 420 Lobby received a new vote",
    }
    rules[:] = [item for item in rules if not (
        isinstance(item, dict) and item.get("provider") == "d-invites"
        and str(item.get("guild_id")) == guild_id)]
    rules.append(entry)
    configured_webhooks(raw)
    save_config(config_path, raw)
    print("Vote notifications configured. Restart the running bumper to observe them.")
    print("Receipts show real provider webhook messages, not automatic vote submissions.")
    return True


def menu(config_path: Path = CONFIG, db_path: Path = STATE) -> None:
    """Show all configured services by default, never launch a browser."""
    while True:
        for line in format_capabilities(read_config(config_path)):
            print(line)
        notices = recent_count(db_path)
        print(f"\nD-INVITES provider vote notifications seen (24h): {notices.get('d-invites', 0)}")
        print("These are webhook notices, not proof your personal account voted.")
        print("1. Connect D-INVITES provider vote notifications (one-time)")
        print("2. Optional: manual voting links and self-reported notes")
        print("0. Back to bumper")
        choice = input("Choose [Enter = back]: ").strip()
        if choice in {"", "0"}:
            return
        try:
            if choice == "1":
                setup_discordinvites_notifications(config_path)
            elif choice == "2":
                manual_menu(config_path, db_path)
            else:
                print("Choose one of the displayed numbers.")
        except (OSError, ValueError) as exc:
            print(f"Could not configure vote notifications: {exc}")


if __name__ == "__main__":
    menu()
