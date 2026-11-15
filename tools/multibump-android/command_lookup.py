"""Resolve Discord application commands with one index fetch per channel.

The upstream library documents application_commands() as heavily rate limited.
Cache each channel's returned commands; never treat an attempted command as a
confirmed bump.
"""
from __future__ import annotations

import time
from typing import Callable


class CommandIndex:
    def __init__(self, *, ttl_seconds: int = 21600, clock: Callable[[], float] = time.monotonic):
        if ttl_seconds < 60:
            raise ValueError("ttl_seconds must be at least one minute")
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._indices: dict[int, tuple[float, list]] = {}

    async def resolve(self, channel, service):
        channel_id = int(channel.id)
        cached = self._indices.get(channel_id)
        now = self.clock()
        if cached is None or now - cached[0] >= self.ttl_seconds:
            getter = getattr(channel, "application_commands", None)
            if not callable(getter):
                raise LookupError("Discord library has no channel.application_commands() method")
            # Fetch a full index once, not a fresh index for each of N services.
            commands = await getter()
            if hasattr(commands, "__aiter__"):
                commands = [command async for command in commands]
            self._indices[channel_id] = (now, list(commands or []))
        else:
            commands = cached[1]

        root, *parts = service.command_name.split()
        matched = next((cmd for cmd in commands
                        if getattr(cmd, "name", None) == root
                        and str(getattr(cmd, "application_id", "")) == str(service.application_id)), None)
        if matched is None:
            raise LookupError(f"/{root} not in server's accessible command index for app {service.application_id}; "
                              "check bot installation, channel permissions, and application ID")
        for part in parts:
            matched = next((sub for sub in (getattr(matched, "children", None) or [])
                            if getattr(sub, "name", None) == part), None)
            if matched is None:
                raise LookupError(f"subcommand {part!r} missing")
        if not callable(matched):
            raise LookupError("command is not invokable")
        return matched
