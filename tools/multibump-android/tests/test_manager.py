import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from engine import classify, load_config
from manage import add, edit_service, get_service, read_catalog, read_config, save_config, main, validate_service

GUILD = '123456789012345678'
CHANNEL = '123456789012345679'
OTHER = '123456789012345670'
APP = '123456789012345671'


class ManagerTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.path = Path(self.temp.name) / 'config.json'
        self.catalog = read_catalog()
        self.raw = read_config(self.path)

    def tearDown(self):
        self.temp.cleanup()

    def test_catalog_contains_expected_services(self):
        self.assertIn('discodus', self.catalog)
        self.assertIn('discadia', self.catalog)
        self.assertEqual(self.catalog['discadia']['cooldown_seconds'], 86400)
        self.assertIsNone(self.catalog['discodus']['cooldown_seconds'])

    def test_add_known_and_restart_validation(self):
        one = add(self.raw, self.catalog, profile='discadia', guild_id=GUILD, channel_id=CHANNEL,
                  non_interactive=True)
        self.assertTrue(one['enabled'])
        save_config(self.path, self.raw)
        _, entries = load_config(self.path)
        self.assertEqual(entries[0].application_id, 1222548162741538938)
        self.assertEqual(entries[0].cooldown_seconds, 86400)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_discordus_requires_actual_cooldown(self):
        with self.assertRaisesRegex(ValueError, 'cooldown'):
            add(self.raw, self.catalog, profile='discodus', guild_id=GUILD,
                channel_id=CHANNEL, non_interactive=True)
        s = add(self.raw, self.catalog, profile='discodus', guild_id=GUILD,
                channel_id=CHANNEL, cooldown_minutes=120, non_interactive=True)
        self.assertEqual(s['cooldown_seconds'], 7200)

    def test_custom_and_multiple_guilds(self):
        one = add(self.raw, self.catalog, profile='custom', label='Test Bot', guild_id=GUILD,
                  channel_id=CHANNEL, application_id=APP, cooldown_minutes=90, non_interactive=True)
        two = add(self.raw, self.catalog, profile='custom', label='Test Bot', guild_id=OTHER,
                  channel_id=CHANNEL, application_id=APP, cooldown_minutes=90, non_interactive=True)
        self.assertNotEqual(one['id'], two['id'])
        save_config(self.path, self.raw)
        _, services = load_config(self.path)
        self.assertEqual(len(services), 2)

    def test_duplicate_provider_guild_rejected(self):
        add(self.raw, self.catalog, profile='discadia', guild_id=GUILD, channel_id=CHANNEL,
            non_interactive=True)
        with self.assertRaisesRegex(ValueError, 'already exists'):
            add(self.raw, self.catalog, profile='discadia', guild_id=GUILD,
                channel_id=OTHER, non_interactive=True)

    def test_bad_custom_input_wont_write_file(self):
        with self.assertRaisesRegex(ValueError, 'numeric ID'):
            add(self.raw, self.catalog, profile='custom', label='Bad', guild_id='wrong',
                channel_id=CHANNEL, application_id=APP, cooldown_minutes=90, non_interactive=True)
        self.assertFalse(self.path.exists())

    def test_edit_disable_reenable_and_backup(self):
        first = add(self.raw, self.catalog, profile='discadia', guild_id=GUILD, channel_id=CHANNEL,
                    non_interactive=True)
        save_config(self.path, self.raw)
        args = type('A', (), dict(guild_id=None, channel_id=OTHER, app_id=None, command=None, name=None, cooldown_minutes=720))()
        edit_service(first, args, False)
        save_config(self.path, self.raw)
        self.assertEqual(self.path.with_name('config.json.bak').stat().st_mode & 0o777, 0o600)
        _, services = load_config(self.path)
        self.assertEqual(services[0].channel_id, int(OTHER))
        self.assertEqual(services[0].cooldown_seconds, 43200)
        self.assertEqual(json.loads(self.path.with_name('config.json.bak').read_text())['services'][0]['channel_id'], CHANNEL)
        first['enabled'] = False
        save_config(self.path, self.raw)
        self.assertEqual(read_config(self.path)['services'][0]['enabled'], False)
        first['enabled'] = True
        save_config(self.path, self.raw)
        _, services = load_config(self.path)
        self.assertEqual(len(services), 1)

    def test_bad_edit_preserves_original_config(self):
        first = add(self.raw, self.catalog, profile='discadia', guild_id=GUILD, channel_id=CHANNEL,
                    non_interactive=True)
        save_config(self.path, self.raw)
        before = self.path.read_bytes()
        first['cooldown_seconds'] = 30
        with self.assertRaisesRegex(ValueError, 'cooldown'):
            save_config(self.path, self.raw)
        self.assertEqual(before, self.path.read_bytes())

    def test_cli_add_disable_enable_remove(self):
        args = ['--config', str(self.path), 'add', 'discadia', '--guild-id', GUILD, '--channel-id', CHANNEL, '--yes']
        self.assertEqual(main(args), 0)
        key = read_config(self.path)['services'][0]['id']
        self.assertEqual(main(['--config',str(self.path),'disable',key]), 0)
        self.assertFalse(read_config(self.path)['services'][0]['enabled'])
        self.assertEqual(main(['--config',str(self.path),'enable',key]), 0)
        self.assertTrue(read_config(self.path)['services'][0]['enabled'])
        self.assertEqual(main(['--config',str(self.path),'remove',key]), 0)
        self.assertEqual(read_config(self.path)['services'], [])

    def test_interactive_reuse_channel(self):
        add(self.raw, self.catalog, profile='disboard', guild_id=GUILD, channel_id=CHANNEL,
            non_interactive=True)
        with patch('builtins.input', side_effect=['', '', '', '', '']):
            s = add(self.raw, self.catalog, profile='discadia')
        self.assertEqual(s['guild_id'], GUILD)
        self.assertEqual(s['channel_id'], CHANNEL)
        self.assertEqual(s['cooldown_seconds'], 86400)


    def test_success_message_with_next_bump_time_does_not_get_labeled_cooldown(self):
        add(self.raw, self.catalog, profile='disboard', guild_id=GUILD, channel_id=CHANNEL,
            non_interactive=True)
        save_config(self.path, self.raw)
        _, services = load_config(self.path)
        self.assertEqual(classify('Bump done! You can bump again in 2 hours.', services[0]), 'confirmed')

    def test_default_config_does_not_create_invalid_services(self):
        self.assertEqual(read_config(self.path)['services'], [])
        self.assertFalse(self.path.exists())


if __name__ == '__main__':
    unittest.main()
