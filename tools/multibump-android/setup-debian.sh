#!/bin/bash
# Runs INSIDE the isolated MultiBump Debian PRoot environment only.
set -euo pipefail
cd /opt/multibump
# PRoot-Distro 5.x may not set the `container` environment variable.
# Check the guest filesystem instead of relying on an optional shell variable.
if [[ ! -f /etc/debian_version ]]; then
  echo 'Expected a Debian environment. From Termux run: bash install-termux.sh' >&2
  exit 2
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends git python3 python3-venv python3-pip ca-certificates
if [[ ! -x .venv-debian/bin/python ]]; then
  python3 -m venv .venv-debian
fi
# The pinned upstream revision is a VCS source install; permit building only
# that source while pip preferentially selects binary wheels for dependencies.
.venv-debian/bin/python -m pip install --disable-pip-version-check --prefer-binary -r requirements.txt
.venv-debian/bin/python -m pip check
.venv-debian/bin/python doctor.py
.venv-debian/bin/python -m unittest discover -s tests -q -b
printf '\nMultiBump Debian environment installed. Run ./run-termux.sh from Termux.\n'
