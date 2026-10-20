#!/usr/bin/env bash
# Builds the single-binary release: web app embedded, MCP server included.
#   scripts/build-go.sh            native binary at release/dwell
#   scripts/build-go.sh all        mac (arm64, amd64), linux (amd64, arm64), windows (amd64)
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${VERSION:-$(node -p "require('./package.json').version")}"

echo "→ web app"
npm run build --silent
echo "→ embedded data"
npx tsx scripts/export-go-data.ts >/dev/null
rm -rf go/web && mkdir -p go/web && cp -R dist/. go/web/

mkdir -p release
build() { # os arch
  local out="release/dwell-$1-$2"; [ "$1" = windows ] && out="$out.exe"
  (cd go && GOOS="$1" GOARCH="$2" CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o "../$out" .)
  echo "   $out ($(du -h "$out" | cut -f1))"
}

if [ "${1:-}" = all ]; then
  echo "→ go build (all targets)"
  for t in darwin/arm64 darwin/amd64 linux/amd64 linux/arm64 windows/amd64; do build "${t%/*}" "${t#*/}"; done
else
  echo "→ go build"
  (cd go && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o ../release/dwell .)
  echo "   release/dwell ($(du -h release/dwell | cut -f1))"
fi
