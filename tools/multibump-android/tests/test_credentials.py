"""Tests for opt-in persistence of sensitive Discord credentials on Termux."""
from contextlib import redirect_stdout
from io import StringIO
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

import credentials


class CredentialTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.homemock = patch('pathlib.Path.home', return_value=self.home)
        self.homemock.start()
        self.addCleanup(self.homemock.stop)

    def test_first_run_opt_in_then_restart_without_prompt(self):
        output = StringIO()
        with patch('builtins.input', return_value='y') as asks, \
             patch('credentials.getpass.getpass', return_value='FAKE.TEST.TOKEN') as secret, \
             redirect_stdout(output):
            self.assertEqual(credentials.bootstrap(), 0)
        asks.assert_called_once()
        secret.assert_called_once()
        self.assertNotIn('FAKE.TEST.TOKEN', output.getvalue())
        path = credentials.credential_path()
        self.assertTrue(path.exists())
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)
        self.assertEqual(credentials.read_credential(), 'FAKE.TEST.TOKEN')
        # Subsequent restart never asks for token or consent again.
        with patch('builtins.input', side_effect=AssertionError('prompted')) as inp, \
             patch('credentials.getpass.getpass', side_effect=AssertionError('prompted')) as secret:
            self.assertEqual(credentials.bootstrap(), 0)
        self.assertFalse(inp.called)
        self.assertFalse(secret.called)

    def test_decline_does_not_write_any_token(self):
        with patch('builtins.input', return_value='n'), \
             patch('credentials.getpass.getpass', side_effect=AssertionError('should not be called')):
            self.assertEqual(credentials.bootstrap(), 3)
        self.assertFalse(credentials.credential_path().exists())

    def test_change_and_forget(self):
        credentials.write_credential('FAKE.FIRST.TOKEN')
        credentials.write_credential('FAKE.SECOND.TOKEN')
        self.assertEqual(credentials.read_credential(), 'FAKE.SECOND.TOKEN')
        credentials.forget_credential()
        self.assertIsNone(credentials.read_credential())

    def test_rejects_wrong_file_permissions(self):
        credentials.write_credential('FAKE.TOKEN')
        credentials.credential_path().chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'permissions are unsafe'):
            credentials.read_credential()

    def test_rejects_symlink_to_external_file(self):
        external = self.home / 'external'
        external.write_text('FAKE.TOKEN')
        folder = credentials.credential_dir()
        folder.mkdir(mode=0o700, parents=True)
        credentials.credential_path().symlink_to(external)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            credentials.read_credential()
        with self.assertRaisesRegex(ValueError, 'regular file'):
            credentials.write_credential('FAKE.NEW.TOKEN')
        self.assertEqual(external.read_text(), 'FAKE.TOKEN')

    def test_no_accidental_token_in_project_or_config(self):
        credentials.write_credential('FAKE.TOKEN')
        self.assertNotIn('multibump-selfbot', str(credentials.credential_path()))
        self.assertTrue(str(credentials.credential_path()).startswith(str(self.home)))
        self.assertNotIn('FAKE.TOKEN', (Path(__file__).parents[1] / 'config.example.json').read_text())


if __name__ == '__main__':
    unittest.main()
