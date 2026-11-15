import asyncio
import unittest
from types import SimpleNamespace
from command_lookup import CommandIndex


class FakeCommand:
    def __init__(self, name, application_id, children=None):
        self.name = name
        self.application_id = application_id
        self.children = children or []

    async def __call__(self, *args, **kwargs):
        return None


class FakeChannel:
    def __init__(self, id, commands):
        self.id = id
        self.commands = commands
        self.calls = 0

    async def application_commands(self):
        self.calls += 1
        return self.commands


class CommandIndexTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_index_fetch_for_six_bump_services(self):
        channel = FakeChannel(1, [FakeCommand("bump", id) for id in (100, 200, 300, 400, 500, 600)])
        cache = CommandIndex()
        for app in (100, 200, 300, 400, 500, 600):
            cmd = await cache.resolve(channel, SimpleNamespace(command_name="bump", application_id=app))
            self.assertEqual(cmd.application_id, app)
        self.assertEqual(channel.calls, 1)

    async def test_separate_channels_have_separate_indexes(self):
        one = FakeChannel(1, [FakeCommand("bump", 100)])
        two = FakeChannel(2, [FakeCommand("bump", 100)])
        cache = CommandIndex()
        s = SimpleNamespace(command_name="bump", application_id=100)
        await cache.resolve(one, s)
        await cache.resolve(two, s)
        self.assertEqual((one.calls, two.calls), (1, 1))

    async def test_cache_expiry(self):
        t = [0.0]
        cache = CommandIndex(ttl_seconds=60, clock=lambda: t[0])
        channel = FakeChannel(1, [FakeCommand("bump", 100)])
        service = SimpleNamespace(command_name="bump", application_id=100)
        await cache.resolve(channel, service)
        t[0] = 61.0
        await cache.resolve(channel, service)
        self.assertEqual(channel.calls, 2)

    async def test_missing_command_is_not_misattributed(self):
        channel = FakeChannel(1, [FakeCommand("bump", 100)])
        with self.assertRaisesRegex(LookupError, "app 200"):
            await CommandIndex().resolve(channel, SimpleNamespace(command_name="bump", application_id=200))
        self.assertEqual(channel.calls, 1)

    async def test_supports_subcommands(self):
        command = FakeCommand("bump", 100, [FakeCommand("now", 100)])
        actual = await CommandIndex().resolve(FakeChannel(1, [command]), SimpleNamespace(command_name="bump now", application_id=100))
        self.assertEqual(actual.name, "now")

    async def test_failing_fetch_is_not_cached(self):
        class RecoveringChannel(FakeChannel):
            async def application_commands(self):
                self.calls += 1
                if self.calls == 1:
                    raise RuntimeError("temporary failure")
                return self.commands
        channel = RecoveringChannel(1, [FakeCommand("bump", 100)])
        cache = CommandIndex()
        service = SimpleNamespace(command_name="bump", application_id=100)
        with self.assertRaises(RuntimeError):
            await cache.resolve(channel, service)
        await cache.resolve(channel, service)
        self.assertEqual(channel.calls, 2)


if __name__ == "__main__":
    unittest.main()
