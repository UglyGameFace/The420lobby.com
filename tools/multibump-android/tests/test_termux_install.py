"""Installer contract tests that don't require a phone, account, or real package installation."""
import os
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class TermuxInstallTests(unittest.TestCase):
    def test_shell_scripts_have_valid_syntax(self):
        for name in ("install-termux.sh", "setup-debian.sh", "run-termux.sh", "easy-install.sh", "multibump.sh", "vote_tracker.sh"):
            with self.subTest(script=name):
                completed = subprocess.run(["bash", "-n", str(ROOT / name)], capture_output=True, text=True)
                self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_requirements_lock_discord_dependency_to_debian_runtime(self):
        req = (ROOT / "requirements.txt").read_text()
        self.assertIn("discord.py-self @ git+https://github.com/dolfies/discord.py-self.git@2ba64a9a997e151a9c259984e0a179b1fdf4aff4", req)
        self.assertNotIn("discord.py-self==2.1.0", req)
        install = (ROOT / "install-termux.sh").read_text()
        self.assertIn("proot-distro", install)
        self.assertIn("/opt/multibump", install)
        self.assertNotIn("python -m pip install -r", install)
        self.assertIn(".venv-debian/pyvenv.cfg", (ROOT / "run-termux.sh").read_text())
        guest = (ROOT / "setup-debian.sh").read_text()
        self.assertIn("git python3", guest)
        self.assertIn("--prefer-binary -r requirements.txt", guest)
        self.assertIn("-m pip check", guest)
        self.assertNotIn("--no-deps", guest)
        self.assertIn("[[ ! -f /etc/debian_version ]]", guest)
        self.assertNotIn('"${container:-}"', guest)

    def test_native_termux_doctor_reports_correct_route(self):
        # The installer runs these tests under Debian PRoot, where sys.executable
        # points to .venv-debian. Spoofing PREFIX in a subprocess does NOT
        # turn that interpreter into native Termux. Mock both relevant facts.
        import doctor
        output = StringIO()
        with patch.dict(os.environ, {"PREFIX": "/data/data/com.termux/files/usr"}), \
             patch.object(sys, "executable", "/data/data/com.termux/files/usr/bin/python"), \
             redirect_stdout(output):
            result = doctor.diagnose()
        self.assertEqual(result, 2)
        self.assertIn("bash install-termux.sh", output.getvalue())

    def test_guest_debian_does_not_look_like_native_termux(self):
        import doctor
        inherited_prefix = "/data/data/com.termux/files/usr"
        self.assertTrue(doctor.is_native_termux(
            prefix=inherited_prefix,
            executable="/data/data/com.termux/files/usr/bin/python"))
        self.assertFalse(doctor.is_native_termux(
            prefix=inherited_prefix,
            executable="/opt/multibump/.venv-debian/bin/python"))

    def test_launcher_dispatches_to_guest_without_native_python_or_token_argument(self):
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            app, bin_dir = tmp / "app", tmp / "bin"
            app.mkdir(); bin_dir.mkdir()
            (app / "run-termux.sh").write_bytes((ROOT / "run-termux.sh").read_bytes())
            (app / "credentials.py").write_bytes((ROOT / "credentials.py").read_bytes())
            (app / "config.json").write_text('{"services": []}')
            venv = app / ".venv-debian"
            venv.mkdir()
            # A venv's bin/python is a guest-only symlink, so test pyvenv.cfg instead.
            (venv / "pyvenv.cfg").write_text('home = /usr/bin')
            proot = bin_dir / "proot-distro"
            proot.write_text('#!/bin/bash\nprintf "called: %s\\n" "$*"\n')
            proot.chmod(0o755)
            private_home = tmp / 'private_home'
            credentials_dir = private_home / '.config' / 'multibump'
            credentials_dir.mkdir(parents=True, mode=0o700)
            token_file = credentials_dir / 'token'
            token_file.write_text('FAKE.SECRET.TOKEN')
            token_file.chmod(0o600)
            env = os.environ.copy()
            env["HOME"] = str(private_home)
            env["PREFIX"] = "/data/data/com.termux/files/usr"
            env["PATH"] = f"{bin_dir}:{env['PATH']}"
            result = subprocess.run(["bash", str(app / "run-termux.sh")],
                                    capture_output=True, text=True, env=env, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("multibump-debian", result.stdout)
            self.assertIn("--token-file /opt/multibump-private/token", result.stdout)
            self.assertIn("--bind " + str(credentials_dir) + ":/opt/multibump-private", result.stdout)
            self.assertNotIn('FAKE.SECRET.TOKEN', result.stdout)
            self.assertNotIn("--prompt-token", result.stdout)
            self.assertNotIn("DISCORD_TOKEN", result.stdout)

    def test_installer_preserves_existing_config_and_uses_guest(self):
        with tempfile.TemporaryDirectory() as td:
            temp = Path(td)
            home, scripts = temp / "home", temp / "bin"
            home.mkdir()
            scripts.mkdir()
            source = temp / "extracted"
            source.mkdir()
            for filename in ("install-termux.sh", "requirements.txt", "setup-debian.sh", "run-termux.sh", "multibump.sh", "easy-install.sh", "home.py", "credentials.py", "vote_tracker.py", "vote_tracker.sh"):
                (source / filename).write_bytes((ROOT / filename).read_bytes())
            (source / "config.json").write_text('{"services": []}')
            destination = home / "multibump-selfbot"
            destination.mkdir()
            (destination / "config.json").write_text('MY-EXISTING-CONFIG')
            log = temp / "calls.log"
            pkg = scripts / "pkg"
            pkg.write_text('#!/bin/bash\nprintf "pkg %s\\n" "$*" >> "$TEST_CALLS"\n')
            pkg.chmod(0o755)
            proot = scripts / "proot-distro"
            proot.write_text('#!/bin/bash\nprintf "proot %s\\n" "$*" >> "$TEST_CALLS"\n'
                             'if [[ "$1" == login && "$2" == multibump-debian ]]; then exit 1; fi\n')
            proot.chmod(0o755)
            env = os.environ.copy()
            env.update({"PREFIX": "/data/data/com.termux/files/usr", "HOME": str(home),
                        "PATH": str(scripts) + os.pathsep + os.environ["PATH"], "TEST_CALLS": str(log), "MULTIBUMP_BIN_DIR": str(scripts)})
            result = subprocess.run(["bash", str(source / "install-termux.sh")],
                                    capture_output=True, text=True, env=env, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((destination / "config.json").read_text(), 'MY-EXISTING-CONFIG')
            self.assertTrue((destination / "run-termux.sh").exists())
            self.assertEqual((destination / "credentials.py").read_bytes(), (ROOT / "credentials.py").read_bytes())
            self.assertTrue((scripts / "multibump").is_symlink())
            self.assertTrue((scripts / "multibump-votes").is_symlink())
            commands = log.read_text()
            self.assertIn("pkg install -y python proot-distro", commands)
            self.assertIn("proot install debian:bookworm --name multibump-debian", commands)
            self.assertIn("proot login --bind ", commands)
            self.assertIn("/opt/multibump/setup-debian.sh", commands)


if __name__ == "__main__":
    unittest.main()


class V13InstallSmokeTests(unittest.TestCase):
    def test_new_reader_is_in_both_android_install_copy_lists(self):
        project = Path(__file__).resolve().parents[1]
        for name in ('easy-install.sh', 'install-termux.sh'):
            with self.subTest(installer=name):
                self.assertIn('response_reader.py', (project / name).read_text())
                self.assertIn('shared_bump.py', (project / name).read_text())
                self.assertIn('status_view.py', (project / name).read_text())
                self.assertIn('vote_tracker.py', (project / name).read_text())
                self.assertIn('vote_tracker.sh', (project / name).read_text())
                self.assertIn('bumper.py', (project / name).read_text())
        self.assertTrue((project / 'response_reader.py').is_file())
        self.assertTrue((project / 'shared_bump.py').is_file())
        self.assertTrue((project / 'status_view.py').is_file())
