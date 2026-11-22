#!/bin/bash
# Internal synthetic QA only. Never invoke for customer distribution.
set -euo pipefail
fail() { printf '%s\n' "$1" >&2; exit 2; }
[[ $# -eq 6 && "$1" == "--synthetic-qa" ]] || fail 'Usage: bash build-local-qa.sh --synthetic-qa arm64|x86_64 <official-node> <node-exe-sha256> <vetted-api-node_modules> <absolute-output-dir>'
[[ "$(/usr/bin/uname -s)" == Darwin ]] || fail 'macOS and Xcode command-line tools are required'
arch="$2"; node="$3"; digest="$4"; deps="$5"; dest="$6"
[[ "$arch" == arm64 || "$arch" == x86_64 ]] || fail 'Expected a single target architecture'
[[ "$node" == /* && -f "$node" && -x "$node" && ! -L "$node" ]] || fail 'A vetted standalone official Node executable is required'
[[ "$digest" =~ ^[[:xdigit:]]{64}$ ]] || fail 'Expected independently verified executable SHA-256'
actual="$(/usr/bin/shasum -a 256 "$node" | /usr/bin/awk '{print $1}')"
[[ "$actual" == "$(printf '%s' "$digest" | /usr/bin/tr '[:upper:]' '[:lower:]')" ]] || fail 'Node SHA-256 mismatch'
[[ "$(/usr/bin/xcrun lipo -archs "$node")" == "$arch" ]] || fail 'Node architecture mismatch'
[[ "$deps" == /* && -d "$deps" && ! -L "$deps" && -f "$deps/@nestjs/core/package.json" && -f "$deps/express/package.json" ]] || fail 'An already built, audited macOS-only API dependency tree is required'
[[ "$dest" == /* && -d "$dest" && ! -L "$dest" ]] || fail 'Supply an existing plain absolute QA output directory'
src="$(cd -- "$(dirname -- "$0")" && pwd -P)"
/usr/bin/plutil -lint "$src/Info.plist"
[[ ! -e "$dest/AdmissionsWorkbench-QA.app" && ! -L "$dest/AdmissionsWorkbench-QA.app" ]] || fail 'Output already exists'
work="$(/usr/bin/mktemp -d "$dest/.admissions-build.XXXXXXXX")"
app="$work/AdmissionsWorkbench-QA.app"
res="$app/Contents/Resources"
mac="$app/Contents/MacOS"
helper="$mac/admissions-node"
mkdir -p "$mac" "$res/workbench"
/usr/bin/install -m 0644 "$src/Info.plist" "$app/Contents/Info.plist"
/usr/bin/install -m 0755 "$node" "$helper"
"$helper" "$src/stage-runtime.cjs" "$res/workbench"
/usr/bin/ditto "$deps" "$res/workbench/api/node_modules"
/usr/bin/xcrun swiftc -swift-version 5 -target "$arch-apple-macosx13.0" -framework AppKit -framework WebKit -framework CryptoKit -framework UniformTypeIdentifiers -framework CoreGraphics -framework ImageIO "$src/main.swift" -o "$mac/AdmissionsWorkbench"
[[ "$(/usr/bin/xcrun lipo -archs "$mac/AdmissionsWorkbench")" == "$arch" ]] || fail 'App architecture mismatch'
/bin/mv -n "$app" "$dest/AdmissionsWorkbench-QA.app"
[[ ! -e "$app" ]] || fail 'Output collision; staged QA build kept'
printf '%s\n' 'Created local synthetic QA bundle; Finder launch, privacy, signature and release acceptance not verified.'