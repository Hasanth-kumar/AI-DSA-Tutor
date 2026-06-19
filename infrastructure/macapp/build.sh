#!/usr/bin/env bash
# Build "DSA Mastery OS.app" — a native Cocoa launcher around `pnpm study`.
# Usage: bash infrastructure/macapp/build.sh ["/path/to/output/DSA Mastery OS.app"]
# Default output is /Applications/DSA Mastery OS.app
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
APP="${1:-/Applications/DSA Mastery OS.app}"
ICON_SRC="$REPO_ROOT/infrastructure/app-icon.icns"

echo "▶ Building: $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Compile the native launcher (repo path is baked in via DSA_REPO).
clang -fobjc-arc -framework Cocoa -mmacosx-version-min=10.13 \
  -DDSA_REPO="\"$REPO_ROOT\"" \
  -o "$APP/Contents/MacOS/launcher" "$HERE/launcher.m"

cp "$HERE/Info.plist" "$APP/Contents/Info.plist"

if [ -f "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$APP/Contents/Resources/icon.icns"
else
  echo "  ⚠ icon not found at $ICON_SRC (app will use a default icon)"
fi

# Ad-hoc code-sign so macOS doesn't flag it as damaged (esp. on Apple Silicon).
codesign --force --sign - "$APP" >/dev/null 2>&1 || echo "  ⚠ codesign skipped"

# Register with Launch Services so Finder/Dock pick up the icon immediately.
LSREG="/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister"
[ -x "$LSREG" ] && "$LSREG" -f "$APP" || true
touch "$APP"

echo "✓ Done. Repo baked in: $REPO_ROOT"
