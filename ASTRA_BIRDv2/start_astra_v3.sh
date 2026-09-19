#!/usr/bin/env sh
# macOS / Linux 실행
cd "$(dirname "$0")"
PY=python3; command -v python3 >/dev/null 2>&1 || PY=python
[ -f private/corpus.sqlite ] || "$PY" setup_data.py || exit 1
exec "$PY" launch.py "$@"
