#!/usr/bin/env bash
# scaffold.sh — Project VERA initialization script
# Scaffolds a fresh clone into a fully buildable Tauri v2 desktop app.
#
# Usage:
#   chmod +x scaffold.sh
#   ./scaffold.sh
#
# Prerequisites this script verifies before doing anything:
#   - Rust toolchain (rustc, cargo) via https://rustup.rs
#   - Node.js >= 18 and npm
#   - Platform build deps for Tauri v2:
#       macOS:   Xcode Command Line Tools
#       Linux:   libwebkit2gtk-4.1-dev, libgtk-3-dev, librsvg2-dev, build-essential,
#                libssl-dev, libayatana-appindicator3-dev
#       Windows: Microsoft C++ Build Tools + WebView2 (preinstalled on Win11)

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[vera]${NC} $1"; }
warn() { echo -e "${YELLOW}[vera]${NC} $1"; }
fail() { echo -e "${RED}[vera]${NC} $1"; exit 1; }

# ── 1. Verify prerequisites ─────────────────────────────────────────────────

log "Checking prerequisites..."

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install from https://nodejs.org (v18+)."
command -v npm  >/dev/null 2>&1 || fail "npm not found alongside Node.js installation."

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js v18+ required, found v$(node -v)."
fi

if ! command -v rustc >/dev/null 2>&1; then
  fail "Rust not found. Install via: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
fi

if ! command -v cargo >/dev/null 2>&1; then
  fail "cargo not found — Rust install may be incomplete. Restart your shell and retry."
fi

log "Node $(node -v), Rust $(rustc --version | cut -d' ' -f2) — OK"

# Platform-specific native dependency hints (Linux only needs action here;
# macOS/Windows toolchains are usually already present or self-installing)
case "$(uname -s)" in
  Linux*)
    if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
      warn "webkit2gtk-4.1-dev not detected. On Debian/Ubuntu, run:"
      warn "  sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev \\"
      warn "    librsvg2-dev build-essential libssl-dev libayatana-appindicator3-dev curl wget file"
    fi
    ;;
esac

# ── 2. Install frontend dependencies ────────────────────────────────────────

log "Installing npm dependencies..."
npm install

# ── 3. Install Tauri CLI (local, not global) if missing ────────────────────

if ! npx tauri --version >/dev/null 2>&1; then
  log "Installing @tauri-apps/cli locally..."
  npm install --save-dev @tauri-apps/cli@^2.0.0
fi

log "Tauri CLI: $(npx tauri --version)"

# ── 4. Verify Rust crate graph resolves (fast check, no full build) ────────

log "Checking Rust workspace (cargo check)..."
(cd src-tauri && cargo check --quiet) || fail "Rust workspace failed to type-check. See errors above."

# ── 5. Icon asset check ─────────────────────────────────────────────────────

if [ ! -f "src-tauri/icons/32x32.png" ]; then
  warn "No icons found in src-tauri/icons/. 'tauri dev' will run fine, but"
  warn "'tauri build' will fail at the bundling step until you run:"
  warn "  npx tauri icon path/to/source-icon-1024.png"
fi

# ── 6. Done ──────────────────────────────────────────────────────────────────

log "Scaffold complete."
echo ""
echo "  Next steps:"
echo "    npm run tauri:dev     # Launch in hot-reload dev mode (window pops up natively)"
echo "    npm run tauri:build   # Compile a production installer/executable"
echo ""
echo "  Production builds land in:"
echo "    src-tauri/target/release/bundle/"
echo ""
