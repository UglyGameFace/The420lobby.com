"""Exercise the real async worker offline with a fake transport and clock."""
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from bumper import run_bot
from engine import Service, Store


class WorkerTests(unittest.TestCase):
    def test_channel_lookup_failure_is_presend_error_not_unconfirmed_send(self):
        service = Service("lookup", "Lookup", 123456789012345678, 123456789012345679,
                          123456789012345680, "bump", 7200,
                          ("bump done",), ("please wait",), {}, 123456789012345680)
        real_sleep = asyncio.sleep
        with TemporaryDirectory() as td:
            db = Store(Path(td) / "state.db")
            try:
                db.init_services([service], now=100)
                class FakeClient:
                    user = SimpleNamespace(id=123456789012345600)
                    closed = False

                    def event(self, callback):
                        setattr(self, callback.__name__, callback)
                        return callback

                    def is_closed(self):
                        return self.closed

                    async def wait_until_ready(self):
                        return None

                    def get_channel(self, channel_id):
                        raise OSError("channel lookup unavailable")

                    async def start(self, token):
                        await self.on_ready()
                        for _ in range(1000):
                            if db.states()[0][1] == "error":
                                self.closed = True
                                return
                            await real_sleep(0)
                        raise AssertionError("worker never recorded pre-send error")

                client = FakeClient()
                async def accelerated_sleep(seconds):
                    await real_sleep(0)
                with patch.dict("sys.modules", {"discord": SimpleNamespace(Client=lambda: client)}), \
                     patch("engine.time.time", return_value=1000), \
                     patch("bumper.asyncio.sleep", side_effect=accelerated_sleep):
                    asyncio.run(run_bot({}, [service], db, token_override="OFFLINE_TEST_ONLY"))
                state = db.states()[0]
                self.assertEqual(state[1], "error")
                self.assertEqual(state[5], 1)
                self.assertGreaterEqual(state[2], 1300)
                self.assertLess(state[2], 8200)  # no command was sent
                self.assertIsNone(state[4])
            finally:
                db.close()

    def test_overdue_queue_is_spaced_and_unknown_results_are_not_confirmed(self):
        clock = SimpleNamespace(now=10000.0)
        attempts = []
        sleeps = []
        services = [Service(str(i), str(i), 123456789012345678, 123456789012345679,
                            123456789012345680 + i, "bump", 7200,
                            ("successfully bumped",), ("please wait",), {}, 123456789012345680 + i)
                    for i in range(6)]
        real_sleep = asyncio.sleep

        class FakeClient:
            closed = False
            user = SimpleNamespace(id=123456789012345600)

            def event(self, callback):
                setattr(self, callback.__name__, callback)
                return callback

            def is_closed(self):
                return self.closed

            async def wait_until_ready(self):
                return None

            async def start(self, token):
                await self.on_ready()
                async def wait_for_stop():
                    while not self.closed:
                        if len(attempts) >= 6 and all(row[1] != 'pending' for row in db.states()):
                            self.closed = True
                            break
                        await real_sleep(0)
                await asyncio.wait_for(wait_for_stop(), timeout=2)
                await real_sleep(0)

            def get_channel(self, channel_id):
                return SimpleNamespace(id=channel_id, guild=SimpleNamespace(id=services[0].guild_id))

            def __init__(self):
                self.listeners = []

            async def wait_for(self, event, *, check, timeout):
                future = asyncio.get_running_loop().create_future()
                item = (event, check, future)
                self.listeners.append(item)
                try:
                    return await future
                finally:
                    self.listeners.remove(item)

            def dispatch(self, message):
                for event, check, future in tuple(self.listeners):
                    if event == "message" and not future.done() and check(message):
                        future.set_result(message)


        client = FakeClient()

        async def resolve(_index, channel, current):
            async def command(channel, **options):
                attempts.append((current.key, clock.now))
                text = "Successfully bumped!" if current.key != "1" else ""
                if current.key == "2":
                    text = "Please wait 3 hours"
                client.dispatch(SimpleNamespace(
                    channel=SimpleNamespace(id=current.channel_id),
                    author=SimpleNamespace(id=current.response_author_id),
                    created_at=datetime.now(timezone.utc), content=text, embeds=[]))
            return command

        async def advance(seconds):
            sleeps.append(seconds)
            clock.now += seconds
            await real_sleep(0)

        with TemporaryDirectory() as td:
            db = Store(Path(td) / "state.db")
            try:
                db.init_services(services, now=100)
                expected_order = [row[0] for row in db.states()]
                with patch.dict("sys.modules", {"discord": SimpleNamespace(Client=lambda: client)}), \
                     patch("engine.time.time", side_effect=lambda: clock.now), \
                     patch("bumper.CommandIndex.resolve", new=resolve), \
                     patch("bumper.asyncio.sleep", side_effect=advance):
                    asyncio.run(run_bot({"check_interval_seconds": 30, "confirmation_timeout_seconds": 1}, services, db, token_override="OFFLINE_TEST_ONLY"))
                self.assertEqual([key for key, _ in attempts], expected_order)
                for (_, previous), (_, current) in zip(attempts, attempts[1:]):
                    self.assertGreaterEqual(current - previous, 45)
                self.assertTrue(all(seconds in (0, 30) for seconds in sleeps))
                states = {row[0]: row for row in db.states()}
                self.assertEqual(states["1"][1], "no_confirmation")
                self.assertIsNone(states["1"][4])
                self.assertEqual(states["2"][1], "cooldown")
                for key, attempted in attempts:
                    required_wait = 10800 if key == "2" else 7200
                    self.assertGreaterEqual(states[key][2], attempted + required_wait + 120)
            finally:
                db.close()


if __name__ == "__main__":
    unittest.main()
