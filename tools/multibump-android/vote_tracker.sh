#!/data/data/com.termux/files/usr/bin/bash
# Open free-vote controls without stopping the separately running bumper.
set -euo pipefail
cd "$HOME/multibump-selfbot"
exec python vote_tracker.py
