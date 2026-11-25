#!/usr/bin/env bash
# Builds "NBA Career Sim.app" on a Mac (needs Xcode or the Command Line Tools, macOS 13+).
#
#   ./macos/build-app.sh              build the app          -> macos/build/NBA Career Sim.app
#   ./macos/build-app.sh --install    build, then install it so Spotlight and Launchpad find it
#   ./macos/build-app.sh --dmg        build, then make a drag-to-Applications disk image
#   (flags can be combined; --open launches the app at the end)
set -euo pipefail
cd "$(dirname "$0")"

INSTALL=0; DMG=0; OPEN=0
for a in "$@"; do
  case "$a" in
    --install) INSTALL=1 ;;
    --dmg) DMG=1 ;;
    --open) OPEN=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

NAME="NBA Career Sim"
APP="build/$NAME.app"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

echo "1/5 bundling the game page (dist/index.html)"
(cd .. && python3 scripts/build.py)

echo "2/5 compiling the SwiftUI app (universal: Apple silicon + Intel)"
if swift build -c release --arch arm64 --arch x86_64 2>/dev/null; then
  BIN="$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)/NBACareerSim"
else
  echo "    universal build not available here, building for this Mac only"
  swift build -c release
  BIN="$(swift build -c release --show-bin-path)/NBACareerSim"
fi

echo "3/5 assembling $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/NBACareerSim"
cp Info.plist "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"
cp ../dist/index.html "$APP/Contents/Resources/index.html"

ICONSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" Resources/AppIcon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z "$((s * 2))" "$((s * 2))" Resources/AppIcon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

# macOS 26 Icon Composer file (Liquid Glass): compiled with actool when this Xcode can do it; the PNG-based icon above is the fallback
if [[ -d "Resources/NBA Career Sim.icon" ]] && xcrun --find actool >/dev/null 2>&1; then
  ACT="$(mktemp -d)"
  if xcrun actool "Resources/NBA Career Sim.icon" --compile "$APP/Contents/Resources" --output-format human-readable-text \
       --notices --warnings --errors --output-partial-info-plist "$ACT/partial.plist" --app-icon "NBA Career Sim" \
       --include-all-app-icons --enable-on-demand-resources NO --development-region en --target-device mac \
       --minimum-deployment-target 13.0 --platform macosx >"$ACT/actool.log" 2>&1; then
    echo "    icon: compiled the Icon Composer file"
  else
    echo "    icon: this Xcode could not compile the .icon file, using the PNG icon (log: $ACT/actool.log)"
  fi
fi

echo "4/5 signing (ad hoc, so it runs on this Mac) and checking the bundle"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
plutil -lint "$APP/Contents/Info.plist" >/dev/null

if [[ $INSTALL -eq 1 ]]; then
  echo "5/5 installing"
  if [[ -w /Applications ]]; then DEST="/Applications"; else DEST="$HOME/Applications"; mkdir -p "$DEST"; fi
  osascript -e "tell application \"$NAME\" to quit" >/dev/null 2>&1 || true
  rm -rf "$DEST/$NAME.app"
  ditto "$APP" "$DEST/$NAME.app"
  touch "$DEST/$NAME.app"
  "$LSREGISTER" -f "$DEST/$NAME.app"          # tell Launch Services (Launchpad, Open With, Dock) about it
  mdimport "$DEST/$NAME.app" 2>/dev/null || true   # tell Spotlight about it
  echo "    installed: $DEST/$NAME.app"
  echo "    Spotlight: press ⌘Space and type \"NBA Career\". Launchpad: it appears after the next refresh (a few seconds)."
  TARGET="$DEST/$NAME.app"
else
  echo "5/5 (skipping install; use --install to put it in Applications)"
  TARGET="$APP"
fi

if [[ $DMG -eq 1 ]]; then
  echo "    making the disk image"
  STAGE="$(mktemp -d)"
  ditto "$APP" "$STAGE/$NAME.app"
  ln -s /Applications "$STAGE/Applications"
  rm -f "build/NBA-Career-Sim.dmg"
  hdiutil create -volname "$NAME" -srcfolder "$STAGE" -ov -format UDZO "build/NBA-Career-Sim.dmg" >/dev/null
  echo "    disk image: macos/build/NBA-Career-Sim.dmg (open it, drag the app onto Applications)"
fi

echo "Done."
if [[ $OPEN -eq 1 ]]; then open "$TARGET"; fi
