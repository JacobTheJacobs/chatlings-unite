#!/usr/bin/env bash
set -euo pipefail
# Official OBS Ubuntu PPA: includes Browser Source support.
sudo add-apt-repository -y ppa:obsproject/obs-studio
sudo apt-get update
sudo apt-get install -y obs-studio
node "$(dirname "$0")/setup-obs.mjs"
