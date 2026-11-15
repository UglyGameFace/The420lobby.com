import subprocess
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class DoctorTests(unittest.TestCase):
    def test_doctor_reports_missing_dependency_without_authentication(self):
        # Exercise dependency diagnosis, not the separate native-Termux router.
        # PRoot and CI may inherit PREFIX from the parent environment.
        env = os.environ.copy()
        env.pop('PREFIX', None)
        result = subprocess.run([sys.executable, str(ROOT / 'doctor.py')], capture_output=True, text=True, timeout=20, env=env)
        self.assertIn('Python:', result.stdout)
        self.assertIn('Project directory:', result.stdout)
        self.assertTrue('discord.py-self' in result.stdout)
        self.assertNotIn('Discord user token', result.stdout)
        self.assertIn(result.returncode, (0, 1))
