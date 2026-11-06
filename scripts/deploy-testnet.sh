#!/usr/bin/env bash
set -euo pipefail

ACCOUNT_ID="${1:-}"
if [[ -z "$ACCOUNT_ID" || "$ACCOUNT_ID" != *.testnet ]]; then
  echo "Usage: $0 YOUR_CONTRACT.testnet" >&2
  echo "This script only accepts a .testnet account." >&2
  exit 2
fi
if ! command -v cargo >/dev/null 2>&1 || ! command -v near >/dev/null 2>&1; then
  echo "Install Rust and NEAR CLI-RS before running this script." >&2
  exit 2
fi
if ! cargo near --version >/dev/null 2>&1; then
  echo "Install cargo-near first: cargo install cargo-near --locked" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM="$ROOT/contract/target/near/proof_of_score_bounty.wasm"

cd "$ROOT/contract"
cargo near build non-reproducible-wasm
if [[ ! -f "$WASM" ]]; then
  echo "Expected WASM output not found: $WASM" >&2
  exit 1
fi

near deploy "$ACCOUNT_ID" "$WASM" --network-id testnet
near call --use-account "$ACCOUNT_ID" --network-id testnet "$ACCOUNT_ID" new '{}'
echo "Deployed and initialized $ACCOUNT_ID on NEAR testnet."
