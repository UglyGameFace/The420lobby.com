import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
from engine import Store, Service, classify, load_config, parse_wait_seconds


def service(key='a'):
    return Service(key, key, 123456789012345678, 123456789012345679, 123456789012345680,
                   'bump', 7200, ('successfully bumped',), ('cooldown', 'try again'), {}, 123456789012345680)


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Store(Path(self.tmp.name) / 'state.sqlite3',
                        rng=Mock(randint=Mock(side_effect=lambda low, high: low)))
        self.s = service()
        self.db.init_services([self.s], now=100)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_first_run_delayed(self):
        self.assertFalse(self.db.due(self.s, now=114))
        self.assertTrue(self.db.due(self.s, now=115))

    def test_single_reservation_prevents_duplicate(self):
        self.assertTrue(self.db.reserve(self.s, now=115))
        self.assertFalse(self.db.reserve(self.s, now=115))
        self.assertFalse(self.db.due(self.s, now=116))

    def test_confirm_and_persist(self):
        self.db.reserve(self.s, now=115)
        self.db.update(self.s, 'confirmed', 'ok', now=130)
        self.assertFalse(self.db.due(self.s, now=130 + 7200))
        self.assertTrue(self.db.due(self.s, now=130 + 7320))
        self.assertEqual(self.db.states()[0][1], 'confirmed')
        self.assertEqual(self.db.states()[0][4], 130)

    def test_unverified_holds_full_cooldown(self):
        self.db.reserve(self.s, now=115)
        self.db.update(self.s, 'no_confirmation', 'ephemeral', now=145)
        self.assertFalse(self.db.due(self.s, now=146))
        self.assertFalse(self.db.due(self.s, now=145 + 7200))

    def test_blocked_never_runs(self):
        self.db.reserve(self.s, now=115)
        self.db.update(self.s, 'blocked', 'missing command', now=116)
        self.assertFalse(self.db.due(self.s, now=999999999999))

    def test_cooldown_response_uses_longer_reported_wait(self):
        self.db.reserve(self.s, now=115)
        self.db.update(self.s, 'cooldown', '1h 2m', now=120, retry_after=3720)
        self.assertFalse(self.db.due(self.s, now=120 + 3720))
        self.assertTrue(self.db.due(self.s, now=120 + 3840))

    def test_backoff_only_on_presend_error(self):
        self.db.update(self.s, 'error', 'before invocation', now=115)
        self.assertTrue(self.db.due(self.s, now=415))
        self.db.update(self.s, 'error', 'before invocation', now=415)
        self.assertFalse(self.db.due(self.s, now=715))
        self.assertTrue(self.db.due(self.s, now=1015))

    def test_classification_negative_first(self):
        self.assertEqual(classify('Successfully bumped! But cooldown remains', self.s), 'cooldown')
        self.assertEqual(classify('Successfully bumped', self.s), 'confirmed')
        self.assertEqual(classify('Thanks for using me', self.s), 'response_seen')

    def test_duration_parse(self):
        self.assertEqual(parse_wait_seconds('Try again in 1h 23m'), 4980)
        self.assertEqual(parse_wait_seconds('wait 2 hours 1 minute'), 7260)
        self.assertIsNone(parse_wait_seconds('unknown'))

    def test_config_validation(self):
        path = Path(self.tmp.name) / 'test.json'
        raw = {"services": [{"id":"abc", "guild_id": "123456789012345678", "channel_id": "123456789012345679", "application_id": "123456789012345680", "command_name":"bump", "cooldown_seconds":7200,"success_patterns":["success"],"cooldown_patterns":["wait"]}]}
        path.write_text(json.dumps(raw))
        conf, services = load_config(path)
        self.assertEqual(services[0].command_name, 'bump')
        raw['services'][0]['guild_id'] = 'YOUR_ID'
        path.write_text(json.dumps(raw))
        with self.assertRaisesRegex(ValueError, 'Discord numeric ID'):
            load_config(path)


if __name__ == '__main__':
    unittest.main()
