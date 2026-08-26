#!/usr/bin/env bash

set -euo pipefail

for variable_name in \
  CHATGPTX_DEVELOPER_ID_P12_PATH \
  CHATGPTX_DEVELOPER_ID_P12_PASSWORD \
  CHATGPTX_RELEASE_KEYCHAIN_PATH \
  CHATGPTX_RELEASE_KEYCHAIN_PASSWORD
do
  [[ -n "${!variable_name:-}" ]] || {
    echo "$variable_name is required." >&2
    exit 1
  }
done

[[ "$(uname -s)" == "Darwin" ]] || {
  echo "The release keychain requires macOS." >&2
  exit 1
}
[[ -f "$CHATGPTX_DEVELOPER_ID_P12_PATH" ]] || {
  echo "The Developer ID PKCS#12 file does not exist." >&2
  exit 1
}
[[ ! -e "$CHATGPTX_RELEASE_KEYCHAIN_PATH" ]] || {
  echo "The release keychain already exists." >&2
  exit 1
}

for command in codesign openssl security; do
  command -v "$command" >/dev/null || {
    echo "$command is required." >&2
    exit 1
  }
done

keychain_created=0
cleanup_on_failure() {
  local exit_code=$?
  trap - EXIT
  if ((exit_code != 0 && keychain_created == 1)); then
    security delete-keychain "$CHATGPTX_RELEASE_KEYCHAIN_PATH" \
      >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap cleanup_on_failure EXIT

security create-keychain \
  -p "$CHATGPTX_RELEASE_KEYCHAIN_PASSWORD" \
  "$CHATGPTX_RELEASE_KEYCHAIN_PATH"
keychain_created=1
security set-keychain-settings \
  -lut 21600 \
  "$CHATGPTX_RELEASE_KEYCHAIN_PATH"
security unlock-keychain \
  -p "$CHATGPTX_RELEASE_KEYCHAIN_PASSWORD" \
  "$CHATGPTX_RELEASE_KEYCHAIN_PATH"
security import "$CHATGPTX_DEVELOPER_ID_P12_PATH" \
  -k "$CHATGPTX_RELEASE_KEYCHAIN_PATH" \
  -P "$CHATGPTX_DEVELOPER_ID_P12_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security \
  >/dev/null
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$CHATGPTX_RELEASE_KEYCHAIN_PASSWORD" \
  "$CHATGPTX_RELEASE_KEYCHAIN_PATH" \
  >/dev/null
security list-keychains \
  -d user \
  -s "$CHATGPTX_RELEASE_KEYCHAIN_PATH"

mapfile_path="$(mktemp "${TMPDIR:-/tmp}/chatgptx-identities.XXXXXX")"
security find-identity \
  -v \
  -p codesigning \
  "$CHATGPTX_RELEASE_KEYCHAIN_PATH" \
  | awk '/Developer ID Application:/{print $2}' \
  > "$mapfile_path"

identity_count="$(wc -l < "$mapfile_path" | tr -d ' ')"
[[ "$identity_count" == "1" ]] || {
  rm -f "$mapfile_path"
  echo "The PKCS#12 file must contain one Developer ID Application identity." >&2
  exit 1
}
identity="$(head -1 "$mapfile_path")"
rm -f "$mapfile_path"
[[ "$identity" =~ ^[0-9A-F]{40}$ ]] || {
  echo "The Developer ID Application identity has an invalid SHA-1 value." >&2
  exit 1
}

certificate_subject="$(
  security find-certificate \
    -c "Developer ID Application" \
    -p \
    "$CHATGPTX_RELEASE_KEYCHAIN_PATH" \
    | openssl x509 -noout -subject -nameopt RFC2253
)"
team_identifier="$(
  sed -n 's/.*OU=\([^,]*\).*/\1/p' <<< "$certificate_subject"
)"
[[ "$team_identifier" =~ ^[A-Z0-9]{10}$ ]] || {
  echo "The Developer ID certificate has no valid team identifier." >&2
  exit 1
}

printf 'identity=%s\nteam=%s\n' "$identity" "$team_identifier"
trap - EXIT
