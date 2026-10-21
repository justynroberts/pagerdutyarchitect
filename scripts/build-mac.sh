#!/usr/bin/env bash
# Builds the Mac release: "PagerDuty Architect.app" on a drag-to-Applications disk image, plus the
# Sparkle appcast that tells installed copies about it.
# Signed with the Developer ID and notarised when this Mac has them, ad-hoc otherwise.
#   scripts/build-mac.sh        -> release/PagerDuty-Architect-<version>.dmg and release/appcast.xml
# Nothing is tagged, pushed or published. Publishing both files on a GitHub release is what ships the
# update: installed copies read releases/latest/download/appcast.xml.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="PagerDuty Architect"
BUNDLE_ID=com.fintonlabs.pagerduty-architect
VERSION="$(node -p "require('./package.json').version")"
WORK=release/mac
APP="$WORK/$NAME.app"
DMG="release/PagerDuty-Architect-$VERSION.dmg"
PROFILE=notarytool
REPO=justynroberts/pagerdutyarchitect
FEED="https://github.com/$REPO/releases/latest/download/appcast.xml"
# Update signing key: private half in the login keychain under this account, public half below.
SPARKLE_ACCOUNT=pagerduty-architect
SPARKLE_PUBLIC_KEY="zTkUj2451TeVn/g7quVNARqjpxv72py2g+ui2w+wMgg="
SPARKLE_VERSION=2.10.0
SPARKLE_SHA256=c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c
SPARKLE="release/vendor/sparkle-$SPARKLE_VERSION"

# Refuse first, build second.
IDENTITY="$(security find-identity -v -p codesigning | grep -o '"Developer ID Application[^"]*"' | head -1 | tr -d '"' || true)"
NOTARISE=0
if [ -z "$IDENTITY" ]; then
  echo "! no Developer ID certificate: ad-hoc build, it will only open on this Mac"
  IDENTITY=-
elif xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1; then
  NOTARISE=1
else
  echo "! notarytool profile '$PROFILE' did not answer: signed but not notarised, other Macs will refuse it"
fi
TS=(--timestamp); [ "$IDENTITY" = - ] && TS=()
APPCAST=1
if ! security find-generic-password -s "https://sparkle-project.org" -a "$SPARKLE_ACCOUNT" >/dev/null 2>&1; then
  echo "! no Sparkle key '$SPARKLE_ACCOUNT' in the keychain: no appcast, so installed copies won't see this update"
  APPCAST=0
fi

if [ ! -d "$SPARKLE/Sparkle.framework" ]; then
  echo "→ Sparkle $SPARKLE_VERSION"
  mkdir -p "$SPARKLE"
  curl -fsSL -o "$SPARKLE.tar.xz" "https://github.com/sparkle-project/Sparkle/releases/download/$SPARKLE_VERSION/Sparkle-$SPARKLE_VERSION.tar.xz"
  echo "$SPARKLE_SHA256  $SPARKLE.tar.xz" | shasum -a 256 -c --quiet || { echo "Sparkle download does not match its checksum"; rm -rf "$SPARKLE" "$SPARKLE.tar.xz"; exit 1; }
  tar -xJf "$SPARKLE.tar.xz" -C "$SPARKLE"
fi
if [ $APPCAST = 1 ] && [ "$("$SPARKLE/bin/generate_keys" --account "$SPARKLE_ACCOUNT" -p 2>/dev/null | tail -1)" != "$SPARKLE_PUBLIC_KEY" ]; then
  echo "the keychain's Sparkle key doesn't match SPARKLE_PUBLIC_KEY: installed copies would reject this update"; exit 1
fi

echo "→ tests"
npm test --silent >/dev/null 2>&1 || { echo "web tests failed: run npm test"; exit 1; }

echo "→ dwell $VERSION (web app embedded)"
scripts/build-go.sh all >/dev/null
(cd go && go test ./... >/dev/null) || { echo "go tests failed: cd go && go test ./..."; exit 1; }

rm -rf "$WORK" && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$APP/Contents/Frameworks"
lipo -create release/dwell-darwin-arm64 release/dwell-darwin-amd64 -output "$APP/Contents/MacOS/dwell"
if strings -a "$APP/Contents/MacOS/dwell" | grep -q /Users/; then echo "dwell has build-machine paths in it"; exit 1; fi

echo "→ launcher"
for arch in arm64 x86_64; do
  xcrun swiftc -O -target "$arch-apple-macos12" -F "$SPARKLE" -framework Sparkle \
    -Xlinker -rpath -Xlinker @executable_path/../Frameworks mac/Launcher.swift -o "$WORK/launcher-$arch"
done
lipo -create "$WORK/launcher-arm64" "$WORK/launcher-x86_64" -output "$APP/Contents/MacOS/$NAME"
rm "$WORK"/launcher-*
# The XPC services are only for sandboxed apps, and this one isn't.
ditto "$SPARKLE/Sparkle.framework" "$APP/Contents/Frameworks/Sparkle.framework"
rm -rf "$APP/Contents/Frameworks/Sparkle.framework/Versions/B/XPCServices" "$APP/Contents/Frameworks/Sparkle.framework/XPCServices"

echo "→ icon"
ICONSET="$WORK/AppIcon.iconset" && mkdir -p "$ICONSET"
node -e "const {Resvg}=require('@resvg/resvg-js');const fs=require('fs');fs.writeFileSync(process.argv[1],new Resvg(fs.readFileSync('mac/icon.svg'),{fitTo:{mode:'width',value:1024}}).render().asPng())" "$ICONSET/icon_512x512@2x.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$ICONSET/icon_512x512@2x.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  [ $s != 512 ] && sips -z $((s*2)) $((s*2)) "$ICONSET/icon_512x512@2x.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns" && rm -rf "$ICONSET"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleExecutable</key><string>$NAME</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>Made by FintonLabs</string>
  <key>SUFeedURL</key><string>$FEED</string>
  <key>SUPublicEDKey</key><string>$SPARKLE_PUBLIC_KEY</string>
  <key>SUEnableAutomaticChecks</key><true/>
</dict></plist>
PLIST

echo "→ sign ($IDENTITY)"
# Inside out: Sparkle's helpers, Sparkle, dwell, then the app.
SF="$APP/Contents/Frameworks/Sparkle.framework"
codesign --force --options runtime "${TS[@]}" --sign "$IDENTITY" "$SF/Versions/B/Autoupdate"
codesign --force --options runtime "${TS[@]}" --sign "$IDENTITY" "$SF/Versions/B/Updater.app"
codesign --force --options runtime "${TS[@]}" --sign "$IDENTITY" "$SF"
codesign --force --options runtime "${TS[@]}" --identifier "$BUNDLE_ID.dwell" --sign "$IDENTITY" "$APP/Contents/MacOS/dwell"
codesign --force --options runtime "${TS[@]}" --sign "$IDENTITY" "$APP"
codesign --verify --strict --deep "$APP"

notarise() { # file
  local out; out="$(xcrun notarytool submit "$1" --keychain-profile "$PROFILE" --wait 2>&1 || true)"
  if ! grep -q "status: Accepted" <<<"$out"; then
    echo "$out"
    local id; id="$(grep -m1 -o 'id: [0-9a-f-]*' <<<"$out" | cut -d' ' -f2)"
    [ -n "$id" ] && xcrun notarytool log "$id" --keychain-profile "$PROFILE"
    echo "Apple refused to notarise $1"; exit 1
  fi
}

# A ticket can take a little while to reach Apple's CDN after acceptance, and stapling fails until it has.
staple() { # file
  local out
  for i in 1 2 3 4 5 6; do
    out="$(xcrun stapler staple "$1" 2>&1)" && return 0
    sleep $((i * 5))
  done
  echo "could not staple $1: $out"; exit 1
}

# Smoke-test a copy, never the bundle that ships: a launched bundle picks up provenance and won't staple.
echo "→ smoke test"
SMOKE="$PWD/$WORK/smoke" && mkdir -p "$SMOKE" && cp -R "$APP" "$SMOKE/"
PDA_PORT=5941 PDA_DIR="$SMOKE/diagrams" PDA_NO_BROWSER=1 PDA_NO_UPDATES=1 "$SMOKE/$NAME.app/Contents/MacOS/$NAME" >/dev/null 2>&1 &
LAUNCHER=$!
up=0; for _ in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:5941/api/diagrams && { up=1; break; }; sleep 0.25; done
kill "$LAUNCHER" 2>/dev/null || true; wait "$LAUNCHER" 2>/dev/null || true
left=0; pkill -f "dwell --dir $SMOKE/diagrams" && left=1
rm -rf "$SMOKE"
[ $up = 1 ] || { echo "the app did not start its server"; exit 1; }
[ $left = 0 ] || { echo "quitting the app left dwell running"; exit 1; }

if [ $NOTARISE = 1 ]; then
  echo "→ notarise the app"
  ditto -c -k --keepParent "$APP" "$WORK/app.zip" && notarise "$WORK/app.zip" && rm "$WORK/app.zip"
  staple "$APP"
fi

echo "→ disk image"
STAGE="$WORK/dmg" && mkdir -p "$STAGE" && cp -R "$APP" "$STAGE/" && ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname "$NAME $VERSION" -srcfolder "$STAGE" -format UDZO -ov "$DMG" >/dev/null
rm -rf "$STAGE"
codesign --force "${TS[@]}" --sign "$IDENTITY" "$DMG"
if [ $NOTARISE = 1 ]; then
  echo "→ notarise the disk image"
  notarise "$DMG"
  staple "$DMG"
fi

if [ $NOTARISE = 1 ]; then
  echo "→ verify as a download"
  Q="$WORK/verify" && mkdir -p "$Q" && cp "$DMG" "$Q/"
  QD="$Q/$(basename "$DMG")"
  xattr -w com.apple.quarantine "0083;00000000;Safari;" "$QD"
  # Each check says what failed: a silent stop here once cost a rebuild.
  xcrun stapler validate "$QD" >/dev/null 2>&1 || { echo "the disk image has no valid notarisation ticket"; exit 1; }
  GK="$(spctl -a -vvv -t open --context context:primary-signature "$QD" 2>&1 || true)"
  grep -q "Notarized Developer ID" <<<"$GK" || { echo "disk image fails Gatekeeper: $GK"; exit 1; }
  MNT=""
  for _ in 1 2 3; do
    MNT="$(hdiutil attach -nobrowse -readonly "$QD" 2>/dev/null | grep Volumes | awk -F'\t' '{print $NF}' || true)"
    [ -n "$MNT" ] && break; sleep 2
  done
  [ -n "$MNT" ] || { echo "could not mount the disk image to check the app"; exit 1; }
  ok=1
  GK="$(spctl -a -vvv -t exec "$MNT/$NAME.app" 2>&1 || true)"
  grep -q "Notarized Developer ID" <<<"$GK" || { echo "app: $GK"; ok=0; }
  xcrun stapler validate "$MNT/$NAME.app" >/dev/null 2>&1 || { echo "the app has no valid notarisation ticket"; ok=0; }
  hdiutil detach "$MNT" >/dev/null; rm -rf "$Q"
  [ $ok = 1 ] || { echo "the app on the disk image fails Gatekeeper"; exit 1; }
  echo "   Gatekeeper: Notarized Developer ID (disk image and app)"
fi

if [ $APPCAST = 1 ]; then
  echo "→ appcast"
  FEEDDIR="$WORK/feed" && mkdir -p "$FEEDDIR" && cp "$DMG" "$FEEDDIR/"
  "$SPARKLE/bin/generate_appcast" --account "$SPARKLE_ACCOUNT" \
    --download-url-prefix "https://github.com/$REPO/releases/download/v$VERSION/" \
    --link "https://github.com/$REPO/releases" "$FEEDDIR" >/dev/null
  cp "$FEEDDIR/appcast.xml" release/appcast.xml && rm -rf "$FEEDDIR"
  # The signature in the feed must check out against the key the app ships with.
  SIG="$(grep -o 'sparkle:edSignature="[^"]*"' release/appcast.xml | head -1 | cut -d'"' -f2)"
  [ -n "$SIG" ] || { echo "appcast has no signature"; exit 1; }
  "$SPARKLE/bin/sign_update" --verify "$DMG" "$SIG" --account "$SPARKLE_ACCOUNT" >/dev/null 2>&1 \
    || { echo "appcast signature does not verify"; exit 1; }
  grep -q "<sparkle:shortVersionString>$VERSION</sparkle:shortVersionString>" release/appcast.xml || { echo "appcast is not for $VERSION"; exit 1; }
  echo "   release/appcast.xml for $VERSION, signature verified"
fi

echo "✓ $DMG ($(du -h "$DMG" | cut -f1))"
shasum -a 256 "$DMG"
