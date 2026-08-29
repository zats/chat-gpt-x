#!/bin/bash

set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 || "$1" != /* ]]; then
  echo "usage: create-extension.sh <absolute-project-directory> <extension-id> [display-name]" >&2
  exit 64
fi

destination="${1%/}"
extension_id="$2"
extension_name="${3:-$extension_id}"

if [[ -z "$destination" || "$destination" == "/" ]]; then
  echo "The project destination must not be the file system root." >&2
  exit 1
fi

if [[ ! "$extension_id" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
  echo "Extension IDs use lowercase letters, numbers, periods, underscores, and hyphens." >&2
  exit 1
fi
if [[ "$extension_id" == "extensions" || "$extension_id" == "api-test-suite" ]]; then
  echo "The extension ID is reserved by ChatGPTX: $extension_id" >&2
  exit 1
fi
if [[ -z "$extension_name" ||
  "$extension_name" == *$'\n'* ||
  "$extension_name" == *$'\r'* ||
  "$extension_name" == *$'\t'* ]]; then
  echo "The display name must be nonempty and on one line." >&2
  exit 1
fi
if [[ -e "$destination" || -L "$destination" ]]; then
  echo "The project destination already exists: $destination" >&2
  exit 1
fi

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
skill_directory="$(cd "$script_directory/.." && pwd -P)"
template_directory="$skill_directory/assets/extension-template"
destination_parent="$(dirname "$destination")"

/bin/mkdir -p "$destination_parent"
if ! /bin/mkdir "$destination" 2>/dev/null; then
  echo "The project destination already exists: $destination" >&2
  exit 1
fi
/bin/chmod 0700 "$destination"
work_directory="$destination"
destination_identity="$(/usr/bin/stat -f '%d:%i' "$destination")"
cleanup_required=true
cleanup() {
  local current_identity=""
  if [[ "$cleanup_required" != "true" || ! -d "$destination" ||
    -L "$destination" ]]; then
    return
  fi
  current_identity="$(/usr/bin/stat -f '%d:%i' "$destination" 2>/dev/null || true)"
  if [[ "$current_identity" == "$destination_identity" ]]; then
    /bin/rm -rf -- "$destination"
  fi
}
trap cleanup EXIT INT TERM

/bin/cp -R "$template_directory/." "$work_directory/"
api_version="$(/bin/bash "$script_directory/resolve-active-api.sh" "$work_directory/chatgptx.d.ts")"

/bin/mv "$work_directory/package.json.template" "$work_directory/package.json"
/usr/bin/plutil -replace id -string "$extension_id" "$work_directory/package.json"
/usr/bin/plutil -replace name -string "$extension_name" "$work_directory/package.json"
/usr/bin/plutil -replace compatibility.chatgptApi -string "^$api_version" \
  "$work_directory/package.json"
printf '%s\n' "$api_version" > "$work_directory/.chatgptx-api-version"
/bin/chmod 0644 "$work_directory/.chatgptx-api-version"
/usr/bin/plutil -extract id raw -o - "$work_directory/package.json" >/dev/null

cleanup_required=false
trap - EXIT INT TERM

printf 'Created %s for ChatGPTX API %s.\n' "$destination" "$api_version"
