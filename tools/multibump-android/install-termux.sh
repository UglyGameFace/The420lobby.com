#!/data/data/com.termux/files/usr/bin/bash
# Android-specific installer. Uses Debian PRoot to avoid incompatible native curl_cffi builds.
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd -P)"
if [[ "${PREFIX:-}" != /data/data/com.termux/files/usr* ]]; then
  echo 'Run this using the Termux app: bash install-termux.sh' >&2
  exit 2
fi
if [[ "$source_dir" != "$HOME" && "$source_dir" != "$HOME/"* ]]; then
  target="$HOME/multibump-selfbot"
  mkdir -p "$target"
  echo "Moving runnable files to Termux private storage: $target"
  # Preserve user configuration and history if a previous installation exists.
  for filename in bumper.py response_reader.py shared_bump.py status_view.py vote_capabilities.py vote_tracker.py vote_tracker.sh command_lookup.py engine.py manage.py home.py credentials.py doctor.py requirements.txt service_catalog.json README.md STATUS.md run-termux.sh install-termux.sh setup-debian.sh easy-install.sh multibump.sh config.example.json .gitignore; do
    [[ -f "$source_dir/$filename" ]] && cp -f "$source_dir/$filename" "$target/$filename"
  done
  for filename in config.json bump_state.sqlite3; do
    if [[ -f "$source_dir/$filename" && ! -f "$target/$filename" ]]; then
      cp "$source_dir/$filename" "$target/$filename"
    fi
  done
  if [[ -d "$source_dir/tests" ]]; then
    mkdir -p "$target/tests"
    cp -f "$source_dir/tests/"*.py "$target/tests/"
  fi
  project_dir="$target"
else
  project_dir="$source_dir"
fi
pkg install -y python proot-distro
if ! proot-distro login multibump-debian -- /bin/true >/dev/null 2>&1; then
  echo 'Installing a separate Debian environment for compatible Linux Python dependencies.'
  proot-distro install debian:bookworm --name multibump-debian
fi
proot-distro login --bind "$project_dir:/opt/multibump" multibump-debian -- bash /opt/multibump/setup-debian.sh
chmod 700 "$project_dir/multibump.sh" "$project_dir/vote_tracker.sh"
launcher_bin_dir="${MULTIBUMP_BIN_DIR:-$PREFIX/bin}"
ln -sfn "$project_dir/multibump.sh" "$launcher_bin_dir/multibump"
ln -sfn "$project_dir/vote_tracker.sh" "$launcher_bin_dir/multibump-votes"
printf '\nInstalled. To start, type: multibump; for votes in another Termux session: multibump-votes\n'
