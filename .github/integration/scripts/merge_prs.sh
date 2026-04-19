#!/usr/bin/env bash

set -euo pipefail

SELECTED_JSON='[]'
DRY_RUN='false'
FRODO_STUB_PATTERN='const program = new FrodoStubCommand('
FRODO_COMMAND_PATTERN='const program = new FrodoCommand('

while [ $# -gt 0 ]; do
  case "$1" in
    --selected-json)
      SELECTED_JSON="${2:-[]}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="${2:-false}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

ALLOWLIST_FILE="$(mktemp)"
ALLOWLIST_SORTED_FILE="$(mktemp)"
AUTO_ALLOWLIST_FILE="$(mktemp)"
EXTRA_FILE=".github/integration/union-allowlist-extra.txt"
BLOCKLIST_FILE=".github/integration/union-blocklist.txt"
ATTRIBUTES_FILE=".git/info/attributes"
ORIGINAL_ATTRIBUTES_FILE="$(mktemp)"
HAD_ATTRIBUTES_FILE='false'

if [ -f "$ATTRIBUTES_FILE" ]; then
  cp "$ATTRIBUTES_FILE" "$ORIGINAL_ATTRIBUTES_FILE"
  HAD_ATTRIBUTES_FILE='true'
fi

cleanup() {
  if [ "$HAD_ATTRIBUTES_FILE" = 'true' ]; then
    cp "$ORIGINAL_ATTRIBUTES_FILE" "$ATTRIBUTES_FILE"
  else
    rm -f "$ATTRIBUTES_FILE"
  fi
  rm -f "$ALLOWLIST_FILE" "$ALLOWLIST_SORTED_FILE" "$AUTO_ALLOWLIST_FILE" "$ORIGINAL_ATTRIBUTES_FILE"
}
trap cleanup EXIT

normalize_list_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi
  grep -v '^[[:space:]]*$' "$file" | grep -v '^[[:space:]]*#' || true
}

while IFS= read -r file; do
  [ -z "$file" ] && continue
  if grep -q "$FRODO_STUB_PATTERN" "$file" && ! grep -q "$FRODO_COMMAND_PATTERN" "$file"; then
    echo "$file" >> "$AUTO_ALLOWLIST_FILE"
  fi
done < <(git ls-files 'src/cli/**')

{
  cat "$AUTO_ALLOWLIST_FILE" 2>/dev/null || true
  normalize_list_file "$EXTRA_FILE"
} | sed '/^[[:space:]]*$/d' | sort -u > "$ALLOWLIST_FILE"

normalize_list_file "$BLOCKLIST_FILE" | while IFS= read -r blocked; do
  [ -z "$blocked" ] && continue
  grep -Fxv "$blocked" "$ALLOWLIST_FILE" > "${ALLOWLIST_FILE}.tmp" || true
  mv "${ALLOWLIST_FILE}.tmp" "$ALLOWLIST_FILE"
done

cp "$ALLOWLIST_FILE" "$ALLOWLIST_SORTED_FILE"

touch "$ATTRIBUTES_FILE"
while IFS= read -r allow_path; do
  [ -z "$allow_path" ] && continue
  printf '%s merge=union\n' "$allow_path" >> "$ATTRIBUTES_FILE"
done < "$ALLOWLIST_FILE"

git config merge.union.driver true

is_allowlisted_conflict() {
  local path="$1"
  grep -Fxq "$path" "$ALLOWLIST_SORTED_FILE"
}

is_snapshot_conflict() {
  local path="$1"
  [[ "$path" == *.snap || "$path" == *__snapshots__/* ]]
}

snapshot_pattern_for() {
  local path="$1"
  local base
  local stem
  base="$(basename "$path")"
  stem="${base%.snap}"
  stem="${stem%.e2e.test.js}"
  stem="${stem%.e2e.test.ts}"
  stem="${stem%.test.js}"
  stem="${stem%.test.ts}"
  stem="${stem%.spec.js}"
  stem="${stem%.spec.ts}"
  stem="${stem%.js}"
  stem="${stem%.ts}"
  echo "$stem"
}

merged='[]'
skipped='[]'
snapshot_patterns='[]'
snapshot_patterns_file="$(mktemp)"
lockfile_regenerated='false'
lockfile_regen_commit_needed='false'
npm_ci_done='false'

for pr in $(echo "$SELECTED_JSON" | jq -r '.[].number'); do
  title="$(echo "$SELECTED_JSON" | jq -r ".[] | select(.number==$pr) | .title")"
  git fetch origin "pull/$pr/head:pr-$pr"

  if git merge --no-ff "pr-$pr" -m "Merge PR #$pr: $title"; then
    merged="$(echo "$merged" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t}]')"
    continue
  fi

  mapfile -t conflicted_files < <(git diff --name-only --diff-filter=U)

  if [ "${#conflicted_files[@]}" -eq 0 ]; then
    git merge --abort || true
    skipped="$(echo "$skipped" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t,"reason":"merge failed without conflict details"}]')"
    continue
  fi

  has_unresolvable='false'
  for file in "${conflicted_files[@]}"; do
    if is_allowlisted_conflict "$file"; then
      continue
    fi
    if is_snapshot_conflict "$file"; then
      continue
    fi
    if [ "$file" = "package-lock.json" ]; then
      continue
    fi
    has_unresolvable='true'
  done

  if [ "$has_unresolvable" = 'true' ]; then
    git merge --abort || true
    skipped="$(echo "$skipped" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t,"reason":"merge conflict (non-auto-resolvable)"}]')"
    continue
  fi

  auto_resolution_failed='false'
  for file in "${conflicted_files[@]}"; do
    if [ "$file" = "package-lock.json" ]; then
      if git cat-file -e ":2:$file" >/dev/null 2>&1; then
        git checkout --ours -- "$file"
      elif git cat-file -e ":3:$file" >/dev/null 2>&1; then
        git checkout --theirs -- "$file"
      fi
      git add "$file"
      lockfile_regen_commit_needed='true'
      continue
    fi

    if is_snapshot_conflict "$file"; then
      if git cat-file -e ":3:$file" >/dev/null 2>&1; then
        git checkout --theirs -- "$file"
      elif git cat-file -e ":2:$file" >/dev/null 2>&1; then
        git checkout --ours -- "$file"
      fi
      git add "$file"
      pattern="$(snapshot_pattern_for "$file")"
      if [ -n "$pattern" ]; then
        echo "$pattern" >> "$snapshot_patterns_file"
      fi
      continue
    fi

    if is_allowlisted_conflict "$file"; then
      base="$(mktemp)"
      ours="$(mktemp)"
      theirs="$(mktemp)"
      git show ":1:$file" > "$base" 2>/dev/null || true
      git show ":2:$file" > "$ours" 2>/dev/null || true
      git show ":3:$file" > "$theirs" 2>/dev/null || true
      if [ -s "$base" ] && [ -s "$ours" ] && [ -s "$theirs" ]; then
        if ! git merge-file -p --union "$ours" "$base" "$theirs" > "$file"; then
          auto_resolution_failed='true'
        fi
      elif [ -s "$theirs" ]; then
        cp "$theirs" "$file"
      elif [ -s "$ours" ]; then
        cp "$ours" "$file"
      fi
      if grep -q '<<<<<<<\|=======\|>>>>>>>' "$file"; then
        auto_resolution_failed='true'
      fi
      rm -f "$base" "$ours" "$theirs"
      git add "$file"
    fi
  done

  if [ "$auto_resolution_failed" = 'true' ]; then
    git merge --abort || true
    skipped="$(echo "$skipped" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t,"reason":"merge conflict (auto-resolution incomplete)"}]')"
    continue
  fi

  if git diff --name-only --diff-filter=U | grep -q .; then
    git merge --abort || true
    skipped="$(echo "$skipped" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t,"reason":"merge conflict (auto-resolution incomplete)"}]')"
    continue
  fi

  git commit --no-edit
  merged="$(echo "$merged" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t}]')"
done

if [ -s "$snapshot_patterns_file" ]; then
  mapfile -t deduped_patterns < <(sort -u "$snapshot_patterns_file")
  if [ "${#deduped_patterns[@]}" -gt 0 ] && [ "$npm_ci_done" = 'false' ]; then
    npm ci
    npm_ci_done='true'
  fi
  for pattern in "${deduped_patterns[@]}"; do
    [ -z "$pattern" ] && continue
    npm run test:update "$pattern"
    snapshot_patterns="$(echo "$snapshot_patterns" | jq --arg p "$pattern" '. + [$p]')"
  done

  mapfile -t snapshot_files_changed_arr < <(
    {
      git diff --name-only
      git diff --name-only --cached
    } | sort -u | grep -E '(^|/)(__snapshots__/|.*\.snap$)' || true
  )
  if [ "${#snapshot_files_changed_arr[@]}" -gt 0 ]; then
    git add -- "${snapshot_files_changed_arr[@]}"
    git commit -m "test: update integration snapshots"
  fi
fi

if [ "$lockfile_regen_commit_needed" = 'true' ]; then
  if [ "$npm_ci_done" = 'false' ]; then
    npm ci
    npm_ci_done='true'
  fi
  npm i --package-lock-only
  if ! git diff --quiet -- package-lock.json; then
    git add package-lock.json
    git commit -m "chore: regenerate package-lock.json after integration merges"
  fi
  lockfile_regenerated='true'
fi

if git rev-parse --verify origin/main >/dev/null 2>&1; then
  snapshot_files_json="$(
    {
      git diff --name-only origin/main..HEAD \
        | grep -E '(^|/)(__snapshots__/|.*\.snap$)' || true
    } \
      | sort -u \
      | jq -Rsc 'split("\n") | map(select(length > 0))'
  )"
else
  snapshot_files_json='[]'
fi

summary="$(jq -nc \
  --argjson merged "$merged" \
  --argjson skipped "$skipped" \
  --argjson snapshot_patterns "$snapshot_patterns" \
  --argjson snapshot_files "$snapshot_files_json" \
  --arg lockfile_regenerated "$lockfile_regenerated" \
  --arg dry_run "$DRY_RUN" \
  '{
    merged: $merged,
    skipped: $skipped,
    snapshot_patterns_run: $snapshot_patterns,
    snapshot_files_changed: $snapshot_files,
    lockfile_regenerated: ($lockfile_regenerated == "true"),
    dry_run: ($dry_run == "true")
  }')"

echo "$summary" | jq -c .
