#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python server.py --device cuda --port 18768
