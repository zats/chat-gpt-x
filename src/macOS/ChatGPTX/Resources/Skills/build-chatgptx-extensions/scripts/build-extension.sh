#!/bin/bash

set -euo pipefail

if [[ $# -ne 1 || "$1" != /* ]]; then
  echo "usage: build-extension.sh <absolute-project-directory>" >&2
  exit 64
fi

project_directory="${1%/}"
manifest="$project_directory/package.json"
if [[ ! -d "$project_directory" || -L "$project_directory" ]]; then
  echo "The extension project is not a regular directory: $project_directory" >&2
  exit 1
fi
if [[ ! -f "$manifest" || -L "$manifest" ]]; then
  echo "The extension manifest is unavailable: $manifest" >&2
  exit 1
fi

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
skill_directory="$(cd "$script_directory/.." && pwd -P)"
sdk_directory="$project_directory/sdk"
if [[ -L "$sdk_directory" ]] ||
  [[ -e "$sdk_directory" && ! -d "$sdk_directory" ]]; then
  echo "The extension SDK destination must be a regular directory: $sdk_directory" >&2
  exit 1
fi
if [[ ! -d "$sdk_directory" ]]; then
  /bin/mkdir "$sdk_directory"
  /bin/chmod 0700 "$sdk_directory"
fi

cleanup_temporary_files() {
  local temporary_file
  for temporary_file in "${temporary_files[@]}"; do
    /bin/rm -f -- "$temporary_file"
  done
}

refresh_regular_file() {
  local source="$1"
  local destination="$2"
  local destination_parent
  local temporary_file
  if [[ ! -f "$source" || -L "$source" ]]; then
    echo "The bundled SDK source is unavailable: $source" >&2
    exit 1
  fi
  if [[ -L "$destination" || -d "$destination" ]] ||
    [[ -e "$destination" && ! -f "$destination" ]]; then
    echo "The SDK destination must be a regular file path: $destination" >&2
    exit 1
  fi
  destination_parent="$(dirname "$destination")"
  temporary_file="$(/usr/bin/mktemp "$destination_parent/.chatgptx-sdk.XXXXXX")"
  temporary_files+=("$temporary_file")
  /bin/cp "$source" "$temporary_file"
  /bin/chmod 0644 "$temporary_file"
  /bin/mv -fh "$temporary_file" "$destination"
}

api_version_file="$project_directory/.chatgptx-api-version"
if [[ -L "$api_version_file" || -d "$api_version_file" ]] ||
  [[ -e "$api_version_file" && ! -f "$api_version_file" ]]; then
  echo "The API version destination must be a regular file path: $api_version_file" >&2
  exit 1
fi
api_version="$(/bin/bash "$script_directory/resolve-active-api.sh" "$project_directory/chatgptx.d.ts")"
api_version_temporary_file="$(/usr/bin/mktemp "$project_directory/.chatgptx-api-version.XXXXXX")"
temporary_files=("$api_version_temporary_file")
trap cleanup_temporary_files EXIT INT TERM
printf '%s\n' "$api_version" > "$api_version_temporary_file"
/bin/chmod 0644 "$api_version_temporary_file"
/bin/mv -fh "$api_version_temporary_file" "$api_version_file"

storage_runtime="$sdk_directory/extension-storage.js"
storage_declaration="$sdk_directory/extension-storage.d.ts"
refresh_regular_file \
  "$skill_directory/assets/extension-template/sdk/extension-storage.js" \
  "$storage_runtime"
refresh_regular_file \
  "$skill_directory/assets/extension-template/sdk/extension-storage.d.ts" \
  "$storage_declaration"
trap - EXIT INT TERM

/usr/bin/plutil -replace compatibility.chatgptApi \
  -string "^$api_version" "$manifest"

extension_id="$(/usr/bin/plutil -extract id raw -o - "$manifest")"
extension_name="$(/usr/bin/plutil -extract name raw -o - "$manifest")"
extension_version="$(/usr/bin/plutil -extract version raw -o - "$manifest")"
extension_description="$(/usr/bin/plutil -extract description raw -o - "$manifest")"
extension_main="$(/usr/bin/plutil -extract main raw -o - "$manifest")"
compatibility="$(/usr/bin/plutil -extract compatibility.chatgptApi raw -o - "$manifest")"

if [[ ! "$extension_id" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
  echo "The extension ID is invalid: $extension_id" >&2
  exit 1
fi
if [[ "$extension_id" == "extensions" || "$extension_id" == "api-test-suite" ]]; then
  echo "The extension ID is reserved by ChatGPTX: $extension_id" >&2
  exit 1
fi
if [[ -z "$extension_name" || -z "$extension_description" ]]; then
  echo "The extension name and description must not be empty." >&2
  exit 1
fi
if [[ ! "$extension_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "The extension version must be semantic: $extension_version" >&2
  exit 1
fi
if [[ "$extension_main" != "contents/main.js" ]]; then
  echo "The extension main must be contents/main.js." >&2
  exit 1
fi
if [[ "$compatibility" != "^$api_version" ]]; then
  echo "The extension API range was not refreshed." >&2
  exit 1
fi
if [[ "$(/usr/bin/plutil -type capabilities "$manifest")" != "array" ]]; then
  echo "The capabilities manifest member must be an array." >&2
  exit 1
fi
capability_count="$(/usr/bin/plutil -extract capabilities raw -o - "$manifest")"
for ((capability_index = 0; capability_index < capability_count; capability_index++)); do
  capability_type="$(
    /usr/bin/plutil -type "capabilities.$capability_index" "$manifest"
  )"
  if [[ "$capability_type" != "string" ]]; then
    echo "Every capability must be a stable API namespace string." >&2
    exit 1
  fi
  capability="$(
    /usr/bin/plutil -extract "capabilities.$capability_index" raw -o - "$manifest"
  )"
  if [[ ! "$capability" =~ ^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$ ]]; then
    echo "The capability namespace is invalid: $capability" >&2
    exit 1
  fi
done

main_file="$project_directory/$extension_main"
if [[ ! -f "$main_file" || -L "$main_file" ]]; then
  echo "The extension main is unavailable: $main_file" >&2
  exit 1
fi

if [[ ! -f "$storage_runtime" || -L "$storage_runtime" ||
  ! -f "$storage_declaration" || -L "$storage_declaration" ]]; then
  echo "The bundled extension storage utility is incomplete." >&2
  exit 1
fi

settings_main=""
if settings_type="$(/usr/bin/plutil -type settings "$manifest" 2>/dev/null)"; then
  if [[ "$settings_type" != "dictionary" ]]; then
    echo "The settings manifest member must be a dictionary." >&2
    exit 1
  fi
  settings_main="$(/usr/bin/plutil -extract settings.main raw -o - "$manifest")"
  settings_pane="$(/usr/bin/plutil -extract settings.pane raw -o - "$manifest")"
  if [[ "$settings_main" != "contents/settings.js" ]]; then
    echo "The extension settings main must be contents/settings.js." >&2
    exit 1
  fi
  if [[ "$settings_pane" != "$extension_id."* || "$settings_pane" == "$extension_id." ]]; then
    echo "The settings pane must use the extension ID namespace." >&2
    exit 1
  fi
  if [[ ! -f "$project_directory/$settings_main" || -L "$project_directory/$settings_main" ]]; then
    echo "The extension settings bundle is unavailable: $project_directory/$settings_main" >&2
    exit 1
  fi
fi

paths_to_check=("$manifest" "$project_directory/contents")
if [[ -d "$project_directory/sdk" ]]; then
  paths_to_check+=("$project_directory/sdk")
fi
if [[ -n "$(/usr/bin/find "${paths_to_check[@]}" -type l -print -quit)" ]]; then
  echo "Extension packages must not contain symbolic links." >&2
  exit 1
fi

javascript_files=("$main_file")
if [[ -n "$settings_main" ]]; then
  javascript_files+=("$project_directory/$settings_main")
fi
/usr/bin/grep -Eq '(^|[^[:alnum:]_$])require[[:space:]]*\(' \
  "${javascript_files[@]}" && {
  echo "Extension entry points cannot use require(). Keep code in each entry point and use the bundled storage utility." >&2
  exit 1
}
if [[ -d "$project_directory/sdk" ]]; then
  while IFS= read -r javascript_file; do
    javascript_files+=("$javascript_file")
  done < <(/usr/bin/find "$project_directory/sdk" -type f -name '*.js' -print | /usr/bin/sort)
fi
/usr/bin/osascript -l JavaScript \
  "$script_directory/check-javascript.js" \
  "${javascript_files[@]}" >/dev/null

temporary_root_candidate="${TMPDIR:-/tmp}"
if [[ "$temporary_root_candidate" != /* || ! -d "$temporary_root_candidate" ]]; then
  echo "The temporary directory must be an absolute directory: $temporary_root_candidate" >&2
  exit 1
fi
temporary_root="$(cd "$temporary_root_candidate" && pwd -P)"
temporary_root_mode="$((8#$(/usr/bin/stat -f %p "$temporary_root")))"
if (( (temporary_root_mode & 0022) != 0 &&
  (temporary_root_mode & 01000) == 0 )); then
  echo "The temporary directory is writable by other users without the sticky bit: $temporary_root" >&2
  exit 1
fi
build_directory="$(/usr/bin/mktemp -d "$temporary_root/chatgptx-local-extension-build.XXXXXX")"
/bin/chmod 0700 "$build_directory"
cleanup() {
  /bin/rm -rf -- "$build_directory"
}
trap cleanup EXIT INT TERM

/bin/mkdir -p "$build_directory/contents"
/bin/cp "$manifest" "$build_directory/package.json"
/bin/cp "$api_version_file" "$build_directory/.chatgptx-api-version"
/usr/bin/osascript -l JavaScript \
  "$script_directory/bundle-javascript.js" \
  "$build_directory/contents/main.js" \
  "$storage_runtime" \
  "$main_file"
if [[ -n "$settings_main" ]]; then
  /usr/bin/osascript -l JavaScript \
    "$script_directory/bundle-javascript.js" \
    "$build_directory/contents/settings.js" \
    "$storage_runtime" \
    "$project_directory/$settings_main"
fi
/usr/bin/osascript -l JavaScript \
  "$script_directory/check-javascript.js" \
  "$build_directory/contents/"*.js >/dev/null
printf '%s\n' "ChatGPTX local extension build" \
  > "$build_directory/.chatgptx-local-build"
/bin/chmod -R go-rwx "$build_directory"

trap - EXIT INT TERM
printf '%s\n' "$build_directory"
