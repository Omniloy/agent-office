#!/bin/bash
# The Miscelaneous floor's verification toolchain: Bombadil 0.8.0 (V3) and the TLA+ tools 1.7.4 (V4, and mx-statechart),
# plus checks for Java, Bun, ffmpeg and Playwright. Downloads only into ~/.local; it installs nothing system-wide.
#   bash setup/verify-tools.sh            download what is missing, verify checksums, print versions
#   bash setup/verify-tools.sh --check    only check (no downloads); exit 1 if something needed is missing
#   bash setup/verify-tools.sh --dry-run  say what it would download
set -u
MODE="${1:-install}"
BOMBADIL_VERSION=0.8.0
BOMBADIL="$HOME/.local/bin/bombadil"
TLA_VERSION=1.7.4
TLA_JAR="$HOME/.local/share/tla/tla2tools-$TLA_VERSION.jar"
TLA_SHA=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88   # the pin mx-statechart uses
TLA_URL="https://github.com/tlaplus/tlaplus/releases/download/v$TLA_VERSION/tla2tools.jar"
case "$(uname -sm)" in
  "Darwin arm64") BASSET=bombadil-aarch64-darwin ;;
  "Darwin x86_64") BASSET=bombadil-x86_64-darwin ;;
  *) BASSET="" ;;
esac
BOMBADIL_URL="https://github.com/antithesishq/bombadil/releases/download/v$BOMBADIL_VERSION/$BASSET"
bad=0
say() { echo "$1"; }
need() { if command -v "$1" >/dev/null 2>&1; then say "ok  $1: $($2 2>&1 | head -1)"; else say "NO  $1: $3"; bad=1; fi; }
opt()  { if command -v "$1" >/dev/null 2>&1; then say "ok  $1: $($2 2>&1 | head -1)"; else say "--  $1 (optional): $3"; fi; }

# Bombadil
if [ -x "$BOMBADIL" ] && "$BOMBADIL" --version 2>/dev/null | grep -q "$BOMBADIL_VERSION"; then say "ok  bombadil $("$BOMBADIL" --version 2>&1 | head -1)"
elif [ "$MODE" = "--check" ]; then say "NO  bombadil $BOMBADIL_VERSION at $BOMBADIL"; bad=1
elif [ -z "$BASSET" ]; then say "NO  bombadil: no release asset for $(uname -sm); use docker or build it (github.com/antithesishq/bombadil)"; bad=1
elif [ "$MODE" = "--dry-run" ]; then say "would download $BOMBADIL_URL to $BOMBADIL"
else
  mkdir -p "$(dirname "$BOMBADIL")"
  # with curl, not a browser: Gatekeeper blocks a browser-downloaded binary
  if curl -fsSL -o "$BOMBADIL.part" "$BOMBADIL_URL"; then
    chmod +x "$BOMBADIL.part" && mv "$BOMBADIL.part" "$BOMBADIL"
    say "ok  bombadil downloaded: $("$BOMBADIL" --version 2>&1 | head -1); sha256 $(shasum -a 256 "$BOMBADIL" | cut -d' ' -f1) (record it on the tool card)"
  else rm -f "$BOMBADIL.part"; say "NO  bombadil download failed: $BOMBADIL_URL"; bad=1; fi
fi

# TLA+ tools, checked against the pin
if [ -f "$TLA_JAR" ] && [ "$(shasum -a 256 "$TLA_JAR" | cut -d' ' -f1)" = "$TLA_SHA" ]; then say "ok  tla2tools $TLA_VERSION ($TLA_JAR, sha256 matches the pin)"
elif [ "$MODE" = "--check" ]; then say "NO  tla2tools $TLA_VERSION at $TLA_JAR with sha256 $TLA_SHA"; bad=1
elif [ "$MODE" = "--dry-run" ]; then say "would download $TLA_URL to $TLA_JAR and check sha256 $TLA_SHA"
else
  mkdir -p "$(dirname "$TLA_JAR")"
  if curl -fsSL -o "$TLA_JAR.part" "$TLA_URL" && [ "$(shasum -a 256 "$TLA_JAR.part" | cut -d' ' -f1)" = "$TLA_SHA" ]; then mv "$TLA_JAR.part" "$TLA_JAR"; say "ok  tla2tools $TLA_VERSION downloaded, sha256 matches the pin"
  else rm -f "$TLA_JAR.part"; say "NO  tla2tools: download failed or the sha256 does not match $TLA_SHA (nothing kept)"; bad=1; fi
fi

need java "java -version" "a JDK is needed for TLC (macOS: /usr/bin/java once a JDK is installed)"
need node "node --version" "Node 22.18+ (or 23.6+) for the kit CLIs and mx-statechart"
need ffmpeg "ffmpeg -version" "brew install ffmpeg (webm to mp4 for V1 videos)"
opt bun "bun --version" "curl -fsSL https://bun.sh/install | bash (only for mx-mode's watch-pr)"
if node -e "require(process.env.HOME + '/node_modules/playwright')" 2>/dev/null; then say "ok  playwright: $(node -e "console.log(require(process.env.HOME + '/node_modules/playwright/package.json').version)")"
else say "--  playwright not in ~/node_modules (kits use the repo's own or this one: cd ~ && npm install playwright && npx playwright install chromium)"; fi
say "--  Lean 4: installed only for a V5 card (see mx-create-formal-verification-skill references/lean.md)"
exit $bad
