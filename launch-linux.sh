#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$root"
unset ELECTRON_RUN_AS_NODE
if [[ "$(uname -s)" != Linux && "$(uname -s)" != Darwin ]]; then printf '%s\n' 'Hermes Voice benötigt einen unterstützten Desktop.' >&2; exit 1; fi
if [[ "$(uname -s)" == Linux && -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then printf '%s\n' 'Bitte Hermes Voice in der angemeldeten Desktop-Sitzung starten.' >&2; exit 1; fi
if [[ -x "$root/node_modules/.bin/electron" ]]; then exec "$root/node_modules/.bin/electron" "$root" "$@"; fi
if command -v electron >/dev/null 2>&1; then exec electron "$root" "$@"; fi
printf '%s\n' 'Electron fehlt. Im Projekt: npm install --no-save electron' >&2
exit 1
