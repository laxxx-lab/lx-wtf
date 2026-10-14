#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$root"
unset ELECTRON_RUN_AS_NODE
if [[ "$(uname -s)" != Linux ]]; then printf '%s\n' 'Lilith Linux benötigt eine Linux-Desktop-Sitzung.' >&2; exit 1; fi
if [[ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then printf '%s\n' 'Bitte Lilith in der angemeldeten Notebook-Desktop-Sitzung starten.' >&2; exit 1; fi
if [[ -x "$root/node_modules/.bin/electron" ]]; then exec "$root/node_modules/.bin/electron" "$root/linux-main.cjs" "$@"; fi
if command -v electron >/dev/null 2>&1; then exec electron "$root/linux-main.cjs" "$@"; fi
printf '%s\n' 'Electron fehlt. Im Projekt: npm install --no-save electron' >&2
exit 1
