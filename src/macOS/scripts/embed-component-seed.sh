#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="${SCRIPT_OUTPUT_FILE_0:?missing component seed output path}"
REPO_ROOT="${CHATGPTX_REPO_ROOT:?missing CHATGPTX_REPO_ROOT build setting}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
node "$REPO_ROOT/scripts/build-component-seed.mjs" "$OUTPUT_DIR"
