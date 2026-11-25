#!/usr/bin/env bash
# Builds "NBA Career Sim.app" on a Mac (needs Xcode or the Command Line Tools, macOS 13+).
#   ./macos/build-app.sh           -> macos/build/NBA Career Sim.app
#   ./macos/build-app.sh --open    -> also launches it
set -euo pipefail
cd "$(dirname "$0")"

echo "1/4 bundling the game page (dist/index.html)"
(cd .. && python3 scripts/build.py)

echo "2/4 compiling the SwiftUI app"
swift build -c release
BIN="$(swift build -c release --show-bin-path)/NBACareerSim"

APP="build/NBA Career Sim.app"
echo "3/4 assembling $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/NBACareerSim"
cp Info.plist "$APP/Contents/Info.plist"
cp ../dist/index.html "$APP/Contents/Resources/index.html"

ICONSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" Resources/AppIcon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z "$((s * 2))" "$((s * 2))" Resources/AppIcon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

echo "4/4 signing (ad hoc, for this Mac only)"
codesign --force --sign - "$APP"

echo "Done: macos/$APP"
if [[ "${1:-}" == "--open" ]]; then open "$APP"; fi
