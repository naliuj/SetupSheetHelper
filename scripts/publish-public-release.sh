#!/usr/bin/env bash
# Publishes the current version's signed/notarized macOS build to a public GitHub Release on
# naliuj/setup-sheet-helper-releases — a separate, source-free repo that exists purely so the
# landing page can offer a public download without making the private SetupSheetHelper repo (and
# its full commit history) public. Auto-update still reads from SetupSheetHelper's own private
# Releases (see package.json's build.publish) — this script is additive, not a replacement.
#
# Expects `npm run build:mac` or `npm run release:mac` to have already produced
# dist/Setup Sheet Helper-<version>-arm64.dmg and .zip for the current package.json version.
set -euo pipefail

REPO="naliuj/setup-sheet-helper-releases"
VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"
DIST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dist"
DMG="$DIST_DIR/Setup Sheet Helper-$VERSION-arm64.dmg"
ZIP="$DIST_DIR/Setup Sheet Helper-$VERSION-arm64.zip"

if [ ! -f "$DMG" ]; then
  echo "error: $DMG not found — run npm run build:mac (or release:mac) first" >&2
  exit 1
fi

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release $TAG already exists on $REPO — uploading (overwriting matching assets)..."
  gh release upload "$TAG" "$DMG" "$ZIP" --repo "$REPO" --clobber
else
  echo "Creating release $TAG on $REPO..."
  gh release create "$TAG" "$DMG" "$ZIP" \
    --repo "$REPO" \
    --title "$VERSION" \
    --notes "Public download for Setup Sheet Helper $VERSION. See the [What's New](https://naliuj.github.io/setup-sheet-helper-site/) page or the app's own changelog for details."
fi

echo "Published: https://github.com/$REPO/releases/tag/$TAG"
