#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd -P)"
if [[ "${PREFIX:-}" != /data/data/com.termux/files/usr* ]]; then
  echo 'This launcher is for Android Termux.' >&2
  exit 2
fi
if [[ ! -f "$project_dir/config.json" ]]; then
  echo 'No services configured yet. Run: multibump' >&2
  exit 2
fi
if ! command -v proot-distro >/dev/null 2>&1; then
  echo 'Android runtime missing. Run: bash install-termux.sh' >&2
  exit 2
fi
if [[ ! -f "$project_dir/.venv-debian/pyvenv.cfg" ]]; then
  echo 'Debian Python environment missing. Run: bash install-termux.sh' >&2
  exit 2
fi
# Credential is stored OUTSIDE project/Downloads (in Termux private HOME),
# and never enters a shell command argument or public environment variable.
if python "$project_dir/credentials.py" ensure; then
  private_dir="$HOME/.config/multibump"
  exec proot-distro login --bind "$project_dir:/opt/multibump" \
    --bind "$private_dir:/opt/multibump-private" \
    multibump-debian -- bash -c 'cd /opt/multibump && exec .venv-debian/bin/python bumper.py --config config.json --state bump_state.sqlite3 --token-file /opt/multibump-private/token'
else
  status=$?
  if [[ "$status" -ne 3 ]]; then
    echo 'Unable to load your saved login. Use menu option 6 to inspect or replace it.' >&2
    exit "$status"
  fi
  # Declining persistence keeps the prior hidden prompt behavior.
  exec proot-distro login --bind "$project_dir:/opt/multibump" multibump-debian -- bash -c 'cd /opt/multibump && exec .venv-debian/bin/python bumper.py --config config.json --state bump_state.sqlite3 --prompt-token'
fi
