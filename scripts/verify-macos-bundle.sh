#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
target=${1:?Expected Rust target}
arch=${2:?Expected Mach-O architecture}
dmg=$(find "src-tauri/target/$target/release/bundle/dmg" -maxdepth 1 -name '*.dmg' -print -quit)
test -n "$dmg"
mount=$(mktemp -d)
trap 'hdiutil detach "$mount" -quiet || true; rmdir "$mount" || true' EXIT
hdiutil attach "$dmg" -readonly -nobrowse -mountpoint "$mount"
app="$mount/SnipasteVeya.app"
binary="$app/Contents/MacOS/snipasteveya"
runtime="$app/Contents/Frameworks/libonnxruntime.dylib"
codesign --verify --deep --strict "$app"
lipo "$binary" -verify_arch "$arch"
lipo "$runtime" -verify_arch "$arch"
for model in pp-ocrv5_mobile_det.onnx pp-ocrv5_mobile_rec.onnx ppocrv5_dict.txt; do
  cmp "src-tauri/resources/ocr/$model" "$app/Contents/Resources/resources/ocr/$model"
done
for file in "$binary" "$runtime"; do
  otool -L "$file"
  # Reject accidental links into the CI machine's Homebrew or build directories.
  if otool -L "$file" | tail -n +2 | awk '{print $1}' | grep -E '^/(opt|Users|private|usr/local)/'; then
    echo "Bundle depends on the build host: $file" >&2
    exit 1
  fi
done
HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 ALL_PROXY=http://127.0.0.1:9 \
  "$binary" --check-ocr-bundle "$PWD/tests/fixtures/bilingual-ocr.png"
echo "Verified $arch DMG, signature, models and offline bilingual OCR from mounted app."
