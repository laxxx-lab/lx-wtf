#!/usr/bin/env bash
# Build the transferred, pinned native sources; never download models or use sudo.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
backend=auto
check=false
jobs=${LILITH_BUILD_JOBS:-4}
fail() { printf '%s\n' "$*" >&2; exit 1; }
while (($#)); do
  case "$1" in
    --root) (($# >= 2)) || fail '--root requires a path'; root=$2; shift 2 ;;
    --backend) (($# >= 2)) || fail '--backend requires auto, cpu, cuda or vulkan'; backend=$2; shift 2 ;;
    --check) check=true; shift ;;
    --help) printf 'Usage: bash scripts/setup-linux-runtime.sh [--root PATH] [--backend auto|cpu|cuda|vulkan] [--check]\n'; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done
[[ $jobs =~ ^[1-9][0-9]*$ ]] || fail 'LILITH_BUILD_JOBS must be a positive integer'
case "$backend" in auto|cpu|cuda|vulkan) ;; *) fail 'Invalid backend' ;; esac
root=$(cd -- "$root" && pwd)
for tool in cmake "${CC:-cc}" "${CXX:-c++}"; do
  command -v "$tool" >/dev/null || fail "Missing build tool: $tool"
done
if command -v ninja >/dev/null; then generator=Ninja
elif command -v make >/dev/null; then generator='Unix Makefiles'
else fail 'Missing build tool: ninja or make'; fi
for file in \
  runtime/voice/qwentts.cpp/CMakeLists.txt runtime/voice/qwentts.cpp/ggml/CMakeLists.txt \
  runtime/stt/whisper.cpp/CMakeLists.txt runtime/stt/whisper.cpp/ggml/CMakeLists.txt \
  runtime/voice/models/qwen-talker-1.7b-base-Q8_0.gguf \
  runtime/voice/models/qwen-tokenizer-12hz-Q8_0.gguf \
  runtime/stt/models/ggml-large-v3-turbo.bin runtime/stt/models/ggml-silero-v6.2.0.bin \
  voices/fixed/registry.json; do
  [[ -s "$root/$file" ]] || fail "Missing or empty transferred file: $file"
done
if [[ $backend == auto ]]; then
  if command -v nvcc >/dev/null && command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name --format=csv,noheader >/dev/null 2>&1; then
    backend=cuda
  else
    backend=cpu
    printf 'CUDA compiler or working NVIDIA driver unavailable; building explicit CPU runtime.\n'
  fi
fi
flags=(-DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_BLAS=OFF -DGGML_CUDA=OFF -DGGML_VULKAN=OFF -DGGML_BACKEND_DL=OFF)
case "$backend" in
  cuda)
    command -v nvcc >/dev/null || fail 'CUDA requested but nvcc is missing'
    command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name --format=csv,noheader >/dev/null 2>&1 || fail 'CUDA requested but NVIDIA driver is not ready'
    flags+=(-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=native) ;;
  vulkan)
    command -v glslc >/dev/null || fail 'Vulkan requested but glslc is missing (Vulkan SDK headers/libraries and SPIRV-Headers also required)'
    flags+=(-DGGML_VULKAN=ON) ;;
esac
printf 'backend=%s; generator=%s; jobs=%s\n' "$backend" "$generator" "$jobs"
if $check; then
  printf 'Transferred files and commands checked; native configure, GPU inference and audio remain untested.\n'
  exit 0
fi
voice_build="$root/runtime/voice/build-linux"
stt_build="$root/runtime/stt/build-linux"
cmake -S "$root/runtime/voice/qwentts.cpp" -B "$voice_build" -G "$generator" "${flags[@]}"
cmake --build "$voice_build" --target tts-server --parallel "$jobs"
cmake -S "$root/runtime/stt/whisper.cpp" -B "$stt_build" -G "$generator" "${flags[@]}" \
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_BUILD_SERVER=ON \
  -DWHISPER_CURL=OFF -DWHISPER_SDL2=OFF -DWHISPER_COMMON_FFMPEG=OFF
cmake --build "$stt_build" --target whisper-server --parallel "$jobs"
[[ -x "$voice_build/tts-server" && -x "$stt_build/bin/whisper-server" ]] || fail 'Build finished without expected executable servers'
printf 'Native build complete (backend=%s). No server or microphone was started.\n' "$backend"
