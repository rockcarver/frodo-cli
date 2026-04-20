#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INTEGRATION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOWLIST_EXTRA_FILE="$INTEGRATION_DIR/union-allowlist-extra.txt"
BLOCKLIST_FILE="$INTEGRATION_DIR/union-blocklist.txt"

PRS_JSON='[]'
PRS_LIST=''
DRY_RUN='false'
REPO=''

usage() {
  cat <<USAGE
Usage: merge_prs.sh [--prs-json JSON] [--prs "1 2 3"] [--dry-run true|false] [--repo owner/repo]
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --prs-json)
      PRS_JSON="$2"
      shift 2
      ;;
    --prs)
      PRS_LIST="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -n "$PRS_LIST" ]; then
  PRS_JSON="$(echo "$PRS_LIST" | jq -Rc 'split(" ") | map(select(length > 0)) | map({number:(tonumber)})')"
fi

# Validate JSON shape.
PRS_JSON="$(echo "$PRS_JSON" | jq -c 'if type=="array" then . else error("prs-json must be an array") end')"
DRY_RUN="$(echo "$DRY_RUN" | tr '[:upper:]' '[:lower:]')"
exec 3>&1
exec 1>&2

if [ -z "$REPO" ]; then
  if git remote get-url origin >/dev/null 2>&1; then
    REPO="$(git remote get-url origin | sed -E 's#.*github.com[:/]([^/]+/[^/.]+)(\.git)?$#\1#')"
  fi
fi

declare -A union_allowlist=()

auto_detect_union_allowlist() {
  while IFS= read -r file; do
    [ -f "$file" ] || continue
    if grep -Fq 'const program = new FrodoStubCommand(' "$file" && ! grep -Fq 'const program = new FrodoCommand(' "$file"; then
      union_allowlist["$file"]=1
    fi
  done < <(git ls-files 'src/cli/**')
}

apply_exception_file() {
  local file="$1"
  local mode="$2"
  [ -f "$file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    line="$(echo "$line" | sed -E 's/^\s+|\s+$//g')"
    [ -n "$line" ] || continue
    if [ "$mode" = "add" ]; then
      union_allowlist["$line"]=1
    else
      unset "union_allowlist[$line]"
    fi
  done < "$file"
}

configure_union_attributes() {
  local attributes_file=".git/info/attributes"
  local begin_marker="# integration-batch union allowlist"
  local end_marker="# end integration-batch union allowlist"
  local preserved_file
  local new_file
  mkdir -p "$(dirname "$attributes_file")"
  preserved_file="$(mktemp)"
  new_file="$(mktemp)"

  if [ -f "$attributes_file" ]; then
    awk -v begin="$begin_marker" -v end="$end_marker" '
      $0 == begin { skip=1; next }
      $0 == end { skip=0; next }
      !skip { print }
    ' "$attributes_file" > "$preserved_file"
  fi

  {
    if [ -s "$preserved_file" ]; then
      cat "$preserved_file"
      printf '\n'
    fi
    echo "$begin_marker"
    for file in "${!union_allowlist[@]}"; do
      echo "$file merge=union"
    done | sort
    echo "$end_marker"
  } > "$new_file"

  mv "$new_file" "$attributes_file"
  rm -f "$preserved_file"
}

is_snapshot_path() {
  local path="$1"
  [[ "$path" == *.snap ]] || [[ "$path" == *"/__snapshots__/"* ]]
}

contains_conflict_markers() {
  local file="$1"
  grep -nE '^(<{7}|={7}|>{7})' "$file" >/dev/null 2>&1
}

to_json_array() {
  if [ "$#" -eq 0 ]; then
    echo '[]'
    return
  fi
  printf '%s\n' "$@" | jq -R . | jq -s .
}

derive_snapshot_pattern() {
  local path="$1"
  local name
  name="$(basename "$path")"
  name="${name%.snap}"
  name="$(echo "$name" | sed -E 's/\.(e2e\.)?(test|spec)\.(js|ts)$//')"
  echo "$name"
}

merged='[]'
skipped='[]'
auto_resolved_conflicts='[]'
snapshot_patterns_global='[]'
snapshot_files_global='[]'
npm_ci_done='false'
lockfile_regeneration_attempted='false'
lockfile_regeneration_updated='false'
lockfile_regeneration_prs='[]'

regenerate_lockfile() {
  local pr="$1"
  local title="$2"
  local updated_bool='false'

  lockfile_regeneration_attempted='true'

  if ! npm i --package-lock-only; then
    echo "Failed to regenerate package-lock.json after merge conflict for PR #$pr. Rolling back merge and marking PR as skipped. See npm output above for details." >&2
    lockfile_regeneration_prs="$(echo "$lockfile_regeneration_prs" | jq --argjson n "$pr" --arg t "$title" --argjson u "$updated_bool" '. + [{"number":$n,"title":$t,"updated":$u}]')"
    skipped="$(echo "$skipped" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t,"reason":"lockfile_regeneration_failed"}]')"
    if git rev-parse --verify ORIG_HEAD >/dev/null 2>&1; then
      git reset --hard ORIG_HEAD >/dev/null
    else
      git reset --hard HEAD^ >/dev/null
    fi
    return 0
  fi

  if ! git diff --quiet -- package-lock.json; then
    git add package-lock.json
    git commit -m "chore: regenerate package-lock.json after merge conflict"
    updated_bool='true'
    lockfile_regeneration_updated='true'
  fi

  lockfile_regeneration_prs="$(echo "$lockfile_regeneration_prs" | jq --argjson n "$pr" --arg t "$title" --argjson u "$updated_bool" '. + [{"number":$n,"title":$t,"updated":$u}]')"
}

prepare_snapshot_test_environment() {
  if [ "$npm_ci_done" != 'true' ]; then
    npm ci
    npm_ci_done='true'
  fi

  npm run build:only
  npm i -g

  npm_global_prefix="$(npm prefix -g 2>/dev/null || true)"
  if [ -n "$npm_global_prefix" ]; then
    npm_global_bin="$npm_global_prefix/bin"
    export PATH="$npm_global_bin:$PATH"
    if [ -n "${GITHUB_PATH:-}" ] && [ -n "$npm_global_bin" ]; then
      echo "$npm_global_bin" >> "$GITHUB_PATH"
    fi
  fi

  if ! command -v frodo >/dev/null 2>&1; then
    echo "frodo CLI not found on PATH after npm i -g" >&2
    return 1
  fi
}

for pr in $(echo "$PRS_JSON" | jq -r '.[].number'); do
  unset union_allowlist
  declare -A union_allowlist=()
  auto_detect_union_allowlist
  apply_exception_file "$ALLOWLIST_EXTRA_FILE" add
  apply_exception_file "$BLOCKLIST_FILE" remove
  configure_union_attributes

  title="$(echo "$PRS_JSON" | jq -r ".[] | select(.number==$pr) | .title // \"\"")"
  branch="$(echo "$PRS_JSON" | jq -r ".[] | select(.number==$pr) | .branch // \"\"")"

  if [ -z "$title" ] && [ -n "$REPO" ]; then
    title="$(gh pr view "$pr" --repo "$REPO" --json title --jq .title 2>/dev/null || echo "")"
  fi

  if [ -n "$branch" ]; then
    git fetch origin "$branch:pr-$pr"
  else
    git fetch origin "pull/$pr/head:pr-$pr"
  fi

  safe_title="$(printf '%s' "$title" | tr '\n' ' ')"

  if git merge --no-ff "pr-$pr" -m "Merge PR #$pr: $safe_title"; then
    merged="$(echo "$merged" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t}]')"
    continue
  fi

  mapfile -t conflicted_files < <(git diff --name-only --diff-filter=U)
  if [ "${#conflicted_files[@]}" -eq 0 ]; then
    git merge --abort || true
    skipped="$(echo "$skipped" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t,"reason":"merge failed without conflicted files"}]')"
    continue
  fi

  all_union='true'
  all_snapshot='true'
  has_lockfile_conflict='false'
  non_lock_conflicts=()
  snapshot_conflicts=()

  for file in "${conflicted_files[@]}"; do
    if [ "$file" = "package-lock.json" ]; then
      has_lockfile_conflict='true'
      continue
    fi

    non_lock_conflicts+=("$file")

    if [ -z "${union_allowlist[$file]+x}" ]; then
      all_union='false'
    fi

    if is_snapshot_path "$file"; then
      snapshot_conflicts+=("$file")
    else
      all_snapshot='false'
    fi
  done

  # Keep lockfile-only conflicts for the [ "$has_lockfile_conflict" = 'true' ] && [ "${#non_lock_conflicts[@]}" -eq 0 ] block below.
  if [ "$all_union" = 'true' ] && [ "${#non_lock_conflicts[@]}" -gt 0 ]; then
    has_marker='false'
    for file in "${non_lock_conflicts[@]}"; do
      if [ -f "$file" ] && contains_conflict_markers "$file"; then
        has_marker='true'
        break
      fi
      git add -A -- "$file"
    done

    if [ "$has_marker" = 'true' ]; then
      git merge --abort || true
      skipped="$(echo "$skipped" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t,"reason":"union allowlist conflict still contains markers"}]')"
      continue
    fi

    if [ "$has_lockfile_conflict" = 'true' ]; then
      git checkout --ours -- package-lock.json || true
      git add package-lock.json
    fi

    git commit --no-edit

    if [ "$has_lockfile_conflict" = 'true' ]; then
      regenerate_lockfile "$pr" "$title"
    fi

    merged="$(echo "$merged" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t,"auto_resolved":"union"}]')"
    auto_resolved_conflicts="$(echo "$auto_resolved_conflicts" | jq --argjson n "$pr" --arg t "$title" --argjson f "$(to_json_array "${conflicted_files[@]}")" '. + [{"number":$n,"title":$t,"type":"union","files":$f}]')"
    continue
  fi

  if [ "$all_snapshot" = 'true' ] && [ "${#snapshot_conflicts[@]}" -gt 0 ]; then
    for file in "${snapshot_conflicts[@]}"; do
      git checkout --theirs -- "$file" || true
      git add -A -- "$file"
    done

    if [ "$has_lockfile_conflict" = 'true' ]; then
      git checkout --ours -- package-lock.json || true
      git add package-lock.json
    fi

    git commit --no-edit

    if [ "$has_lockfile_conflict" = 'true' ]; then
      regenerate_lockfile "$pr" "$title"
    fi

    patterns='[]'
    for file in "${snapshot_conflicts[@]}"; do
      pattern="$(derive_snapshot_pattern "$file")"
      if [ -n "$pattern" ]; then
        patterns="$(echo "$patterns" | jq --arg p "$pattern" '. + [$p]')"
      fi
    done
    patterns="$(echo "$patterns" | jq -c 'unique')"

    if [ "$(echo "$patterns" | jq 'length')" -gt 0 ]; then
      prepare_snapshot_test_environment

      while IFS= read -r pattern; do
        [ -n "$pattern" ] || continue
        npm run test:update -- "$pattern"
      done < <(echo "$patterns" | jq -r '.[]')
    fi

    mapfile -t changed_snapshot_files < <(git diff --name-only | grep -E '(^|/)(__snapshots__/|.*\.snap$)' || true)

    if [ "${#changed_snapshot_files[@]}" -gt 0 ]; then
      git add -- "${changed_snapshot_files[@]}"
      git commit -m "test: update snapshots for integration conflict resolution"
    fi

    merged="$(echo "$merged" | jq --argjson n "$pr" --arg t "$title" --argjson p "$patterns" --argjson f "$(to_json_array "${changed_snapshot_files[@]}")" '. + [{"number":$n,"title":$t,"auto_resolved":"snapshot","snapshot_patterns":$p,"snapshot_files":$f}]')"
    auto_resolved_conflicts="$(echo "$auto_resolved_conflicts" | jq --argjson n "$pr" --arg t "$title" --argjson f "$(to_json_array "${conflicted_files[@]}")" '. + [{"number":$n,"title":$t,"type":"snapshot","files":$f}]')"

    snapshot_patterns_global="$(echo "$snapshot_patterns_global" | jq --argjson p "$patterns" '. + $p')"
    snapshot_files_global="$(echo "$snapshot_files_global" | jq --argjson f "$(to_json_array "${changed_snapshot_files[@]}")" '. + $f')"
    continue
  fi

  if [ "$has_lockfile_conflict" = 'true' ] && [ "${#non_lock_conflicts[@]}" -eq 0 ]; then
    git checkout --ours -- package-lock.json || true
    git add package-lock.json
    git commit --no-edit
    regenerate_lockfile "$pr" "$title"

    merged="$(echo "$merged" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t,"auto_resolved":"lockfile"}]')"
    auto_resolved_conflicts="$(echo "$auto_resolved_conflicts" | jq --argjson n "$pr" --arg t "$title" --argjson f "$(to_json_array "${conflicted_files[@]}")" '. + [{"number":$n,"title":$t,"type":"lockfile","files":$f}]')"
    continue
  fi

  git merge --abort || true
  skipped="$(echo "$skipped" | jq --argjson n "$pr" --arg t "$title" '. + [{"number":$n,"title":$t,"reason":"merge conflict (non-auto-resolvable)"}]')"
done

snapshot_patterns_global="$(echo "$snapshot_patterns_global" | jq -c 'map(select(length > 0)) | unique')"
snapshot_files_global="$(echo "$snapshot_files_global" | jq -c 'map(select(length > 0)) | unique')"

jq -cn \
  --arg dry_run "$DRY_RUN" \
  --argjson merged "$(echo "$merged" | jq -c .)" \
  --argjson skipped "$(echo "$skipped" | jq -c .)" \
  --argjson auto_resolved_conflicts "$(echo "$auto_resolved_conflicts" | jq -c .)" \
  --argjson snapshot_patterns "$snapshot_patterns_global" \
  --argjson snapshot_files "$snapshot_files_global" \
  --arg lockfile_attempted "$lockfile_regeneration_attempted" \
  --arg lockfile_updated "$lockfile_regeneration_updated" \
  --argjson lockfile_prs "$(echo "$lockfile_regeneration_prs" | jq -c .)" \
  '{
    dry_run: ($dry_run == "true"),
    merged: $merged,
    skipped: $skipped,
    auto_resolved_conflicts: $auto_resolved_conflicts,
    snapshot_updates: {
      patterns: $snapshot_patterns,
      files: $snapshot_files
    },
    lockfile_regeneration: {
      attempted: ($lockfile_attempted == "true"),
      updated: ($lockfile_updated == "true"),
      prs: $lockfile_prs
    }
  }' >&3
