#!/usr/bin/env bash
# Regenerate infrastructure/app-icon.icns from infrastructure/brand-icon.svg
# (the same hex tile used in the sidebar brand-icon).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
SRC="$REPO_ROOT/infrastructure/brand-icon.svg"
OUT="$REPO_ROOT/infrastructure/app-icon.icns"
ICONSET="$(mktemp -d)/AppIcon.iconset"

if [ ! -f "$SRC" ]; then
  echo "✗ Missing $SRC"
  exit 1
fi

mkdir -p "$ICONSET"

render_png() {
  local size="$1"
  local dest="$2"
  qlmanage -t -s "$size" -o "$(dirname "$dest")" "$SRC" >/dev/null 2>&1
  mv "$(dirname "$dest")/$(basename "$SRC").png" "$dest"
}

render_png 16 "$ICONSET/icon_16x16.png"
render_png 32 "$ICONSET/icon_16x16@2x.png"
cp "$ICONSET/icon_16x16@2x.png" "$ICONSET/icon_32x32.png"
render_png 64 "$ICONSET/icon_32x32@2x.png"
render_png 128 "$ICONSET/icon_128x128.png"
render_png 256 "$ICONSET/icon_128x128@2x.png"
cp "$ICONSET/icon_128x128@2x.png" "$ICONSET/icon_256x256.png"
render_png 512 "$ICONSET/icon_256x256@2x.png"
cp "$ICONSET/icon_256x256@2x.png" "$ICONSET/icon_512x512.png"
render_png 1024 "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$OUT"
cp "$ICONSET/icon_512x512@2x.png" "$REPO_ROOT/packages/frontend/public/apple-touch-icon.png"
cp "$ICONSET/icon_512x512@2x.png" "$REPO_ROOT/packages/frontend/public/dsa-mastery-logo.png"

echo "✓ Wrote $OUT"
echo "✓ Wrote packages/frontend/public/apple-touch-icon.png"
echo "✓ Wrote packages/frontend/public/dsa-mastery-logo.png"
