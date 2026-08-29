#!/bin/bash

set -euo pipefail

if [[ $# -eq 1 && "$1" == /* ]]; then
  destination="$1"
  locked=false
elif [[ $# -eq 2 && "$1" == "--locked" && "$2" == /* ]]; then
  destination="$2"
  locked=true
else
  echo "usage: resolve-active-api.sh <absolute-destination.d.ts>" >&2
  exit 64
fi

if [[ -L "$destination" || -d "$destination" ]] ||
  [[ -e "$destination" && ! -f "$destination" ]]; then
  echo "The API declaration destination must be a regular file path: $destination" >&2
  exit 1
fi
codex_home="${CODEX_HOME:-$HOME/.codex}"
lock_file="$codex_home/extensions/versions-lock.json"
mutation_lock_file="$codex_home/extensions/update.lock"

if [[ ! -f "$lock_file" || -L "$lock_file" ]]; then
  echo "The active ChatGPTX component lock is unavailable at $lock_file." >&2
  echo "Open ChatGPTX, check for component updates, and try again." >&2
  exit 1
fi
if [[ "$locked" == "false" ]]; then
  if [[ ! -f "$mutation_lock_file" || -L "$mutation_lock_file" ]]; then
    echo "The active ChatGPTX update lock is unavailable at $mutation_lock_file." >&2
    exit 1
  fi
  exec /usr/bin/lockf -k "$mutation_lock_file" \
    /bin/bash "$0" --locked "$destination"
fi

api_version="$(/usr/bin/plutil -extract chatgptApi.version raw -o - "$lock_file")"
api_relative_path="$(/usr/bin/plutil -extract chatgptApi.path raw -o - "$lock_file")"

if [[ ! "$api_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "The active ChatGPTX API version is invalid: $api_version" >&2
  exit 1
fi
if [[ "$api_relative_path" != "components/chatgpt-api/$api_version" ]]; then
  echo "The active ChatGPTX API path is invalid: $api_relative_path" >&2
  exit 1
fi

types_file="$codex_home/extensions/$api_relative_path/types.d.ts"
if [[ ! -f "$types_file" || -L "$types_file" ]]; then
  echo "The active ChatGPTX API declarations are unavailable at $types_file." >&2
  echo "Open ChatGPTX, check for component updates, and try again." >&2
  exit 1
fi

destination_parent="$(dirname "$destination")"
if [[ -L "$destination_parent" ]] ||
  [[ -e "$destination_parent" && ! -d "$destination_parent" ]]; then
  echo "The API declaration directory is invalid: $destination_parent" >&2
  exit 1
fi
/bin/mkdir -p "$destination_parent"
temporary_file="$(/usr/bin/mktemp "$destination_parent/.chatgptx-api.XXXXXX")"
cleanup() {
  /bin/rm -f -- "$temporary_file"
}
trap cleanup EXIT INT TERM

/bin/cp "$types_file" "$temporary_file"
/bin/chmod 0644 "$temporary_file"
/bin/mv -fh "$temporary_file" "$destination"
trap - EXIT INT TERM

printf '%s\n' "$api_version"
