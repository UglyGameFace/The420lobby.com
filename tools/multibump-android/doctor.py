"""Offline installation diagnosis for MultiBump; does not request credentials."""
from __future__ import annotations

import importlib
from importlib import metadata
from pathlib import Path
import platform
import sys
import os


def is_native_termux(*, prefix: str | None = None, executable: str | None = None) -> bool:
    """Identify native Termux Python without mistaking its Debian guest for native.

    PRoot inherits environment variables from Termux, so PREFIX alone cannot
    identify the runtime. Check both values and keep the test independent of
    the interpreter running the test suite.
    """
    if prefix is None:
        prefix = os.environ.get("PREFIX", "")
    if executable is None:
        executable = sys.executable
    return prefix.startswith("/data/data/com.termux/") and ".venv-debian" not in executable


def diagnose() -> int:
    print(f"Python: {platform.python_version()} ({sys.executable})")
    print(f"Project directory: {Path(__file__).resolve().parent}")
    errors = []
    if is_native_termux():
        print("Native Termux detected. The current discord.py-self depends on curl_cffi,")
        print("which is not reliably buildable in native Termux for this setup.")
        print("Do NOT keep reinstalling it here. Run: bash install-termux.sh")
        return 2
    if sys.version_info < (3, 10):
        errors.append("Python 3.10+ required. In Termux: pkg update && pkg install python")

    try:
        version = metadata.version("discord.py-self")
        print(f"discord.py-self installed: {version}")
        try:
            major = int(version.split(".", 1)[0])
        except ValueError:
            major = None
        if not version.startswith("2.2.0a"):
            errors.append("Expected pinned upstream 2.2.0 development revision inside the Debian venv. Re-run: bash install-termux.sh")
    except metadata.PackageNotFoundError:
        errors.append("discord.py-self is missing from this Python environment. On Android run: bash install-termux.sh")

    try:
        proto_version = metadata.version("discord-protos")
        print(f"discord-protos installed: {proto_version}")
        if not proto_version.startswith("1.2."):
            errors.append("Expected compatible discord-protos 1.2.x. Re-run: bash install-termux.sh")
    except metadata.PackageNotFoundError:
        errors.append("discord-protos missing. Re-run: bash install-termux.sh")

    try:
        curl = importlib.import_module("curl_cffi")
        print(f"curl_cffi imported: {getattr(curl, '__file__', 'unknown origin')}")
    except Exception as exc:
        errors.append(f"Cannot import curl_cffi: {type(exc).__name__}: {exc}; on Android run bash install-termux.sh")

    for dist in ("discord.py", "py-cord", "nextcord"):
        try:
            version = metadata.version(dist)
        except metadata.PackageNotFoundError:
            continue
        print(f"Potential conflicting Discord package: {dist} {version}")
        errors.append(f"Conflicting {dist} shares the discord namespace; use a fresh environment rather than uninstalling libraries needed by other bots")

    try:
        discord = importlib.import_module("discord")
        print(f"discord module imported: {getattr(discord, '__file__', 'unknown origin')}")
        if not callable(getattr(discord, "Client", None)):
            errors.append("discord module exists, but has no Client (wrong package or local discord.py shadowing it)")
    except (ImportError, OSError, RuntimeError) as exc:
        errors.append(f"Cannot import discord: {type(exc).__name__}: {exc}")
        print("If the error names a shared library (lib...so), install that exact missing system dependency; do not guess.")
    except Exception as exc:
        errors.append(f"Unexpected discord import failure: {type(exc).__name__}: {exc}")

    if errors:
        print("\nINSTALLATION PROBLEMS:")
        for error in errors:
            print(f" - {error}")
        print("\nAndroid installation route: bash install-termux.sh")
        print("The installer uses Debian Linux packages instead of unsupported native Android builds.")
        return 1
    print("\nLibrary import OK. This does NOT verify Discord login or bump commands.")
    return 0


if __name__ == "__main__":
    sys.exit(diagnose())
