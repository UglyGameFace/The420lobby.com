#!/data/data/com.termux/files/usr/bin/bash
# One-time upgrade/bootstrap: reuse the existing Debian runtime if installed.
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd -P)"
if [[ "${PREFIX:-}" != /data/data/com.termux/files/usr* ]]; then
  echo 'Run this from the Termux app.' >&2
  exit 2
fi
target="$HOME/multibump-selfbot"
mkdir -p "$target"
if [[ "$source_dir" != "$target" ]]; then
  for filename in bumper.py response_reader.py shared_bump.py status_view.py command_lookup.py engine.py manage.py home.py credentials.py doctor.py requirements.txt service_catalog.json README.md STATUS.md run-termux.sh install-termux.sh setup-debian.sh easy-install.sh multibump.sh config.example.json .gitignore; do
    if [[ -f "$source_dir/$filename" ]]; then
      cp -f "$source_dir/$filename" "$target/$filename"
    fi
  done
  if [[ -d "$source_dir/tests" ]]; then
    mkdir -p "$target/tests"
    cp -f "$source_dir/tests/"*.py "$target/tests/"
  fi
  # Never replace existing state or credentials.
  for filename in config.json bump_state.sqlite3; do
    if [[ -f "$source_dir/$filename" && ! -e "$target/$filename" ]]; then
      cp "$source_dir/$filename" "$target/$filename"
    fi
  done
fi
chmod 700 "$target/multibump.sh"
launcher_bin_dir="${MULTIBUMP_BIN_DIR:-$PREFIX/bin}"
ln -sfn "$target/multibump.sh" "$launcher_bin_dir/multibump"
# A previous partial installation may leave pyvenv.cfg but no usable libraries.
needs_setup=0
if [[ ! -f "$target/.venv-debian/pyvenv.cfg" ]] || ! command -v proot-distro >/dev/null 2>&1; then
  needs_setup=1
elif ! proot-distro login --bind "$target:/opt/multibump" multibump-debian -- bash -c 'cd /opt/multibump && .venv-debian/bin/python doctor.py' >/dev/null 2>&1; then
  needs_setup=1
fi
if (( needs_setup )); then
  echo 'Repairing missing or incomplete Debian dependencies once...'
  bash "$target/install-termux.sh"
fi
printf '\nInstalled. From now on type just: multibump\n\n'
exec bash "$launcher_bin_dir/multibump"
