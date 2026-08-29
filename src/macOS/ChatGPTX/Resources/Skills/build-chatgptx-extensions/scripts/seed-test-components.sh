#!/bin/bash

set -euo pipefail

if [[ $# -ne 3 || "$1" != /* || "$2" != /* ||
  ! "$3" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: seed-test-components.sh <absolute-source-extensions> <absolute-destination-extensions> <api-version>" >&2
  exit 64
fi

source_extensions="${1%/}"
destination_extensions="${2%/}"
expected_api_version="$3"
source_components="$source_extensions/components"
source_lock="$source_extensions/versions-lock.json"

if [[ ! -d "$source_extensions" || -L "$source_extensions" ||
  ! -d "$source_components" || -L "$source_components" ||
  ! -f "$source_lock" || -L "$source_lock" ]]; then
  echo "The active ChatGPTX component store is unavailable: $source_extensions" >&2
  exit 1
fi
if [[ -e "$destination_extensions" || -L "$destination_extensions" ]]; then
  echo "The isolated component destination already exists: $destination_extensions" >&2
  exit 1
fi
if [[ -n "$(/usr/bin/find "$source_components" -type l -print -quit)" ]]; then
  echo "The active ChatGPTX component store contains a symbolic link." >&2
  exit 1
fi

active_api_version="$(/usr/bin/plutil -extract chatgptApi.version raw -o - "$source_lock")"
if [[ "$active_api_version" != "$expected_api_version" ]]; then
  echo "The active ChatGPTX API changed from $expected_api_version to $active_api_version." >&2
  echo "Build the extension again before starting its test." >&2
  exit 1
fi

/bin/mkdir "$destination_extensions"
/bin/chmod 0700 "$destination_extensions"
/bin/cp -R "$source_components" "$destination_extensions/components"
/bin/cp "$source_lock" "$destination_extensions/versions-lock.json"
/bin/chmod -R u+rwX,go-rwx "$destination_extensions"
