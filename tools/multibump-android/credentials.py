"""Opt-in local user-session credential storage for Android Termux.

The file lives outside the MultiBump project, in Termux's app-private HOME.
It is intentionally not encrypted; anyone with access to that app's private
files can read the account credential. Never print or export its contents.
"""
from __future__ import annotations

import getpass
import os
from pathlib import Path
import stat
import sys
import tempfile


def credential_dir() -> Path:
    return Path.home() / '.config' / 'multibump'


def credential_path() -> Path:
    return credential_dir() / 'token'


def read_credential() -> str | None:
    path = credential_path()
    if not path.exists() and not path.is_symlink():
        return None
    if path.is_symlink() or not path.is_file():
        raise ValueError('Saved login must be a regular file, not a symlink.')
    folder = credential_dir()
    if folder.is_symlink() or stat.S_IMODE(folder.stat().st_mode) != 0o700:
        raise ValueError('Saved login directory permissions are unsafe (must be 700).')
    if stat.S_IMODE(path.stat().st_mode) != 0o600:
        raise ValueError('Saved login file permissions are unsafe (must be 600).')
    value = path.read_text(encoding='utf-8').strip()
    if not value or '\n' in value or '\r' in value:
        raise ValueError('Saved login is empty or malformed. Use menu option 6 to replace it.')
    return value


def write_credential(value: str) -> None:
    if not value or value != value.strip() or '\n' in value or '\r' in value:
        raise ValueError('Account credential was empty or malformed; nothing saved.')
    folder = credential_dir()
    if folder.is_symlink():
        raise ValueError('Saved login folder must not be a symlink.')
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(folder, 0o700)
    path = credential_path()
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ValueError('Saved login file is not a regular file.')
    tmp_name = None
    try:
        fd, tmp_name = tempfile.mkstemp(prefix='.token-', dir=folder)
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            out.write(value)
        os.replace(tmp_name, path)
        tmp_name = None
    finally:
        if tmp_name:
            Path(tmp_name).unlink(missing_ok=True)


def capture_and_save() -> bool:
    print('The token will be saved in Termux app-private storage, readable by anyone with access to Termux files.')
    print('It is NOT encrypted. Never share or screenshot it. Self-bots can get the account terminated.')
    value = getpass.getpass('Enter account credential (hidden): ').strip()
    if not value:
        print('No credential entered. Nothing saved.')
        return False
    write_credential(value)
    print('Login saved privately. Future launches will reuse it without prompting.')
    return True


def forget_credential() -> None:
    path = credential_path()
    if path.is_symlink():
        raise ValueError('Saved login is a symlink; refusing to follow it.')
    path.unlink(missing_ok=True)


def bootstrap() -> int:
    if read_credential():
        return 0
    print('\nMultiBump can remember your login so future restarts need no token.')
    print('It saves a local 600-permission file in Termux private storage, not encrypted.')
    answer = input('Save it on this phone? [y/N]: ').strip().lower()
    if answer not in ('y', 'yes'):
        print('Not saved. This launch will ask for the credential once as before.')
        return 3
    return 0 if capture_and_save() else 3


def main() -> int:
    action = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if action == 'ensure':
        return bootstrap()
    if action == 'replace':
        return 0 if capture_and_save() else 3
    if action == 'forget':
        if input('Forget the saved MultiBump login? [y/N]: ').strip().lower() in ('y', 'yes'):
            forget_credential()
            print('Saved login removed. Next launch will prompt again.')
        return 0
    if action == 'status':
        print('Login saved' if read_credential() else 'Login not saved')
        return 0
    print('Usage: python credentials.py [status|ensure|replace|forget]', file=sys.stderr)
    return 2


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as exc:
        print(f'Account login storage error: {exc}', file=sys.stderr)
        raise SystemExit(2)
