#!/usr/bin/env bash
set -euo pipefail
function release_checksum() {
 local encoded="${1##*/}" name='' character hex
 while [[ -n "$encoded" ]]; do
  character="${encoded:0:1}"
  if [[ "$character" == '%' ]]; then
   hex="${encoded:1:2}"
   [[ "$hex" =~ ^[a-fA-F0-9]{2}$ && "$hex" != 00 ]] || return 1
   printf -v character '%b' "\x$hex"
   encoded="${encoded:3}"
  else encoded="${encoded:1}"; fi
  name+="$character"
 done
 [[ -n "$name" && "$name" != *'/'* && "$name" != *$'\n'* && "$name" != *$'\r'* ]] || return 1
 # Parse the complete filename after SHA256's two separator columns.
 HERMES_RELEASE_NAME="$name" awk '
  substr($0,65,2) == "  " || substr($0,65,2) == " *" {
   if (substr($0,67) == ENVIRON["HERMES_RELEASE_NAME"]) { count++; digest=substr($0,1,64) }
  }
  END { if (count != 1 || length(digest) != 64 || digest ~ /[^a-fA-F0-9]/) exit 1; print digest }
 '
}
mode=source; source_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
artifact=; release_url=; autostart=0; dry_run=0; install_python=0; install_system=0
usage() { echo 'install-linux.sh [--source PATH | --appimage PATH | --release-url HTTPS_URL] [--install-python] [--install-system] [--deb PATH] [--autostart] [--dry-run]'; }
while (($#)); do
 case "$1" in
 --source) mode=source; source_root="$2"; shift 2;;
 --appimage) mode=appimage; artifact="$2"; shift 2;;
 --release-url) mode=download; release_url="$2"; shift 2;;
 --deb) mode=deb; artifact="$2"; shift 2;;
 --install-system) install_system=1; shift;;
 --install-python) install_python=1; shift;;
 --autostart) autostart=1; shift;;
 --dry-run) dry_run=1; shift;;
 --help) usage; exit 0;;
 *) usage >&2; exit 2;;
 esac
done
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo 'Linux x86_64 required.' >&2; exit 1; }
if ((dry_run)); then printf 'mode=%s source=%s artifact=%s python=%s autostart=%s; first launch opens component/gateway setup\n' "$mode" "$source_root" "$artifact" "$install_python" "$autostart"; exit 0; fi
if ((install_system)); then
 sudo apt-get update
 sound_package=libasound2; fuse_package=libfuse2
 if apt-cache show libasound2t64 >/dev/null 2>&1; then sound_package=libasound2t64; fi
 if apt-cache show libfuse2t64 >/dev/null 2>&1; then fuse_package=libfuse2t64; fi
 sudo apt-get install -y python3 python3-venv libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 "$sound_package" "$fuse_package"
fi
if ((install_python)); then sudo apt-get update; sudo apt-get install -y python3 python3-venv; fi
if [[ "$mode" == deb ]]; then
 artifact="$(realpath -- "$artifact")"
 [[ -f "$artifact" && "$artifact" == *.deb ]] || { echo 'A local .deb file is required.' >&2; exit 2; }
 sudo apt-get install -y -- "$artifact"
 if ((autostart)); then
  mapfile -t desktop_entries < <(dpkg-query --listfiles hermes-voice-desktop | grep '/share/applications/[^/]*\.desktop$')
  [[ "${#desktop_entries[@]}" == 1 && -f "${desktop_entries[0]}" ]] || { echo 'Installed package desktop entry was not found uniquely.' >&2; exit 1; }
  mkdir -p -- "${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
  cp -- "${desktop_entries[0]}" "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/hermes-voice.desktop"
 fi
 echo 'Installed Hermes Voice. Open it from your applications menu for setup.'
 exit 0
fi
install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/hermes-voice"
mkdir -p -- "$install_dir"
if [[ "$mode" == download ]]; then
 [[ "$release_url" == https://* && "$release_url" == *.AppImage && "$release_url" != *$'\n'* ]] || { echo 'An HTTPS AppImage URL is required.' >&2; exit 2; }
 temp_dir="$(mktemp -d)"; trap 'rm -rf -- "$temp_dir"' EXIT
 artifact="$temp_dir/HermesVoice.AppImage"
 curl --fail --location --proto '=https' --tlsv1.2 "$release_url" -o "$artifact"
 curl --fail --location --proto '=https' --tlsv1.2 "${release_url%/*}/SHA256SUMS" -o "$temp_dir/SHA256SUMS"
 checksum="$(release_checksum "$release_url" < "$temp_dir/SHA256SUMS")" || { echo 'No unique release checksum found.' >&2; exit 1; }
 [[ "$checksum" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'No unique release checksum found.' >&2; exit 1; }
 printf '%s  %s\n' "$checksum" "$artifact" | sha256sum --check --status
 mode=appimage
fi
if [[ "$mode" == appimage ]]; then
 [[ -f "$artifact" ]] || { echo 'AppImage not found.' >&2; exit 1; }
 cp -- "$artifact" "$install_dir/HermesVoice.AppImage"; chmod u+x -- "$install_dir/HermesVoice.AppImage"
 executable="$install_dir/HermesVoice.AppImage"
else
 source_root="$(cd -- "$source_root" && pwd)"
 command -v npm >/dev/null || { echo 'Install Node.js 22 or newer, then rerun.' >&2; exit 1; }
 (cd -- "$source_root" && npm ci && npm run runtime:install)
 executable="$source_root/node_modules/.bin/electron"
fi
# Desktop entry Exec uses its own escaping rules, never shell interpolation.
escape_exec() { local value="$1"; value="${value//\\/\\\\}"; value="${value//\"/\\\"}"; value="${value//\`/\\\`}"; value="${value//\$/\\\$}"; value="${value//%/%%}"; printf '%s' "$value"; }
[[ "$executable" != *$'\n'* && "$source_root" != *$'\n'* ]] || exit 2
exec_line="\"$(escape_exec "$executable")\""
if [[ "$mode" == source ]]; then exec_line+=" \"$(escape_exec "$source_root")\""; fi
applications="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p -- "$applications"
printf '[Desktop Entry]\nType=Application\nName=Hermes Voice\nExec=%s\nTerminal=false\nCategories=Utility;\n' "$exec_line" > "$applications/hermes-voice.desktop"
if ((autostart)); then mkdir -p -- "${XDG_CONFIG_HOME:-$HOME/.config}/autostart"; cp -- "$applications/hermes-voice.desktop" "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/hermes-voice.desktop"; fi
printf 'Installed launcher: %s\nOpen Hermes Voice to select your gateway and STT/TTS components.\n' "$applications/hermes-voice.desktop"
