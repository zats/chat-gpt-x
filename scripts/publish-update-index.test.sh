#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
publisher="$repository_root/scripts/publish-update-index.sh"
mock_gh="$repository_root/scripts/test-fixtures/publish-update-index/gh"
test_root="$(mktemp -d "${RUNNER_TEMP:-/tmp}/publish-update-index-test.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

mock_bin="$test_root/bin"
state_root="$test_root/state"
candidate_root="$test_root/candidate"
runner_temp="$test_root/runner"
call_log="$test_root/gh-calls.tsv"
mkdir -p "$mock_bin" "$state_root" "$candidate_root" "$runner_temp"
cp "$mock_gh" "$mock_bin/gh"
chmod +x "$mock_bin/gh"
touch "$state_root/release-exists" "$call_log"
printf '%s\n' 25 > "$state_root/published-generation"

write_index() {
  local path="$1"
  local generation="$2"
  local marker="$3"

  jq -n \
    --argjson generation "$generation" \
    --arg marker "$marker" \
    '{
      schemaVersion: 3,
      generation: $generation,
      minimumLauncherVersion: "1.1.0",
      chatgptApis: {},
      bindings: {},
      extensions: {},
      marker: $marker
    }' > "$path"
}

hash_path() {
  local digest

  if command -v sha256sum >/dev/null; then
    read -r digest _ < <(sha256sum "$1")
  else
    read -r digest _ < <(shasum -a 256 "$1")
  fi
  printf '%s\n' "$digest"
}

run_publisher() {
  PATH="$mock_bin:$PATH" \
  MOCK_GH_STATE_ROOT="$state_root" \
  MOCK_GH_CALL_LOG="$call_log" \
  GITHUB_REPOSITORY="example/chatgptx" \
  RUNNER_TEMP="$runner_temp" \
    "$publisher" "$candidate_root/latest.json" \
      0123456789abcdef0123456789abcdef01234567
}

write_index "$state_root/latest.json" 25 old
write_index "$candidate_root/latest.json" 26 candidate
cp "$state_root/latest.json" "$test_root/original-latest.json"
touch "$state_root/fail-next-edit"

if run_publisher > "$test_root/failed-reservation.out" 2>&1; then
  echo "publication unexpectedly continued after its reservation failed" >&2
  exit 1
fi
cmp "$test_root/original-latest.json" "$state_root/latest.json"
[[ "$(< "$state_root/published-generation")" == 25 &&
  ! -f "$state_root/published-index-sha" ]] || {
  echo "a failed reservation changed the published release state" >&2
  exit 1
}
if awk -F '\t' '$1 == "release" && $2 == "upload" { found = 1 } END { exit found ? 0 : 1 }' \
  "$call_log"
then
  echo "publication touched the asset after its reservation failed" >&2
  exit 1
fi

: > "$call_log"
touch "$state_root/fail-next-clobber"

if run_publisher > "$test_root/failed-publish.out" 2>&1; then
  echo "initial clobber publication unexpectedly succeeded" >&2
  exit 1
fi
[[ ! -f "$state_root/latest.json" ]] || {
  echo "the failed clobber did not remove the old test asset" >&2
  exit 1
}

run_publisher > "$test_root/recovery.out"
cmp "$candidate_root/latest.json" "$state_root/latest.json"
cp "$state_root/published-index-sha" "$test_root/candidate-index-sha"

upload_count="$(
  awk -F '\t' '$1 == "release" && $2 == "upload" { count += 1 } END { print count + 0 }' \
    "$call_log"
)"
clobber_count="$(
  awk -F '\t' '
    $1 == "release" && $2 == "upload" {
      for (field = 1; field <= NF; field += 1) {
        if ($field == "--clobber") count += 1
      }
    }
    END { print count + 0 }
  ' "$call_log"
)"
[[ "$upload_count" == 2 && "$clobber_count" == 1 ]] || {
  echo "missing-asset recovery did not use one safe non-clobber upload" >&2
  exit 1
}

: > "$call_log"
write_index "$state_root/latest.json" 27 newer
printf '%s\n' 27 > "$state_root/published-generation"
hash_path "$state_root/latest.json" > "$state_root/published-index-sha"
cp "$state_root/latest.json" "$test_root/newer-latest.json"
run_publisher > "$test_root/stale.out"
cmp "$test_root/newer-latest.json" "$state_root/latest.json"
grep -F "Generation 26 is already superseded by 27" "$test_root/stale.out" >/dev/null
if awk -F '\t' '$1 == "release" && $2 == "upload" { found = 1 } END { exit found ? 0 : 1 }' \
  "$call_log"
then
  echo "a stale generation attempted to overwrite the published asset" >&2
  exit 1
fi

: > "$call_log"
rm "$state_root/latest.json"
if run_publisher > "$test_root/missing-stale.out" 2>&1; then
  echo "a stale generation was accepted for a newer missing reservation" >&2
  exit 1
fi
[[ ! -f "$state_root/latest.json" ]] || {
  echo "a stale generation restored a newer missing asset" >&2
  exit 1
}
grep -F "Generation 26 is older than recorded generation 27" \
  "$test_root/missing-stale.out" >/dev/null
if awk -F '\t' '$1 == "release" && $2 == "upload" { found = 1 } END { exit found ? 0 : 1 }' \
  "$call_log"
then
  echo "a stale generation attempted to restore a newer missing asset" >&2
  exit 1
fi

: > "$call_log"
printf '%s\n' 26 > "$state_root/published-generation"
printf '%064d\n' 0 > "$state_root/published-index-sha"
if run_publisher > "$test_root/different-equal-recovery.out" 2>&1; then
  echo "equal-generation recovery accepted different content" >&2
  exit 1
fi
[[ ! -f "$state_root/latest.json" ]] || {
  echo "equal-generation recovery restored different content" >&2
  exit 1
}
grep -F "Generation 26 is already selected with different content" \
  "$test_root/different-equal-recovery.out" >/dev/null

: > "$call_log"
rm "$state_root/published-index-sha"
if run_publisher > "$test_root/legacy-equal-recovery.out" 2>&1; then
  echo "equal-generation recovery accepted legacy metadata without a hash" >&2
  exit 1
fi
[[ ! -f "$state_root/latest.json" ]] || {
  echo "legacy equal-generation recovery restored unverified content" >&2
  exit 1
}
grep -F "Generation 26 cannot be recovered without its published index hash" \
  "$test_root/legacy-equal-recovery.out" >/dev/null

: > "$call_log"
cp "$test_root/candidate-index-sha" "$state_root/published-index-sha"
run_publisher > "$test_root/equal-recovery.out"
cmp "$candidate_root/latest.json" "$state_root/latest.json"
upload_count="$(
  awk -F '\t' '$1 == "release" && $2 == "upload" { count += 1 } END { print count + 0 }' \
    "$call_log"
)"
clobber_count="$(
  awk -F '\t' '
    $1 == "release" && $2 == "upload" {
      for (field = 1; field <= NF; field += 1) {
        if ($field == "--clobber") count += 1
      }
    }
    END { print count + 0 }
  ' "$call_log"
)"
[[ "$upload_count" == 1 && "$clobber_count" == 0 ]] || {
  echo "equal-generation recovery did not use a safe non-clobber upload" >&2
  exit 1
}

: > "$call_log"
write_index "$state_root/latest.json" 27 old-order-asset
printf '%s\n' 25 > "$state_root/published-generation"
rm "$state_root/published-index-sha"
write_index "$candidate_root/latest.json" 28 reserved
touch "$state_root/fail-next-clobber"
if run_publisher > "$test_root/write-ahead-failure.out" 2>&1; then
  echo "write-ahead clobber failure unexpectedly succeeded" >&2
  exit 1
fi
[[ ! -f "$state_root/latest.json" ]] || {
  echo "the write-ahead clobber failure did not remove the old asset" >&2
  exit 1
}
[[ "$(< "$state_root/published-generation")" == 28 ]] || {
  echo "the write-ahead reservation did not record generation 28" >&2
  exit 1
}
cp "$state_root/published-index-sha" "$test_root/generation-28-index-sha"
edit_line="$(
  awk -F '\t' '$1 == "release" && $2 == "edit" { print NR; exit }' "$call_log"
)"
upload_line="$(
  awk -F '\t' '$1 == "release" && $2 == "upload" { print NR; exit }' "$call_log"
)"
[[ "$edit_line" =~ ^[0-9]+$ && "$upload_line" =~ ^[0-9]+$ &&
  "$edit_line" -lt "$upload_line" ]] || {
  echo "the generation 28 reservation was not written before clobber" >&2
  exit 1
}

: > "$call_log"
write_index "$candidate_root/latest.json" 26 stale-after-reservation
if run_publisher > "$test_root/write-ahead-stale.out" 2>&1; then
  echo "a stale generation restored an asset below the write-ahead reservation" >&2
  exit 1
fi
[[ ! -f "$state_root/latest.json" ]] || {
  echo "a stale generation replaced the missing reserved asset" >&2
  exit 1
}
cmp "$test_root/generation-28-index-sha" "$state_root/published-index-sha"
grep -F "Generation 26 is older than recorded generation 28" \
  "$test_root/write-ahead-stale.out" >/dev/null
if awk -F '\t' '$1 == "release" && $2 == "upload" { found = 1 } END { exit found ? 0 : 1 }' \
  "$call_log"
then
  echo "a stale generation attempted upload below the write-ahead reservation" >&2
  exit 1
fi

echo "publish-update-index recovery tests passed"
