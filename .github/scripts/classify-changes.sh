#!/usr/bin/env bash
#
# Classifies a pull request by the files it changes. Reads one file name per
# line on stdin (a renamed file contributes its new and its previous name) and
# prints two lines:
#
#   code=<true|false>      the long test matrix is needed
#   guidance=<true|false>  the fast `guidance` job is needed instead
#
# Called by the `Detect code changes` job in .github/workflows/pipeline.yml,
# which reads this file from the pull request's BASE commit, so a pull request
# never picks the rules that judge it. Rules: docs/PIPELINE.md, "Detect code
# changes", and the records 0012 and 0016 in
# https://github.com/rockcarver/frodo/tree/main/docs/decisions.
#
# Fail safe: the answer is code=true unless the input is a complete list in
# which EVERY file is on the non-code list below. An empty list, or one that
# may have been cut short (LIMIT lines or more), counts as code. A failure of
# this script is treated as code by the caller too.
#
# guidance=true only comes with code=false: when code=true the Test job runs
# the guidance tests as well.

set -eu

LIMIT=3000

# Files that cannot change what the test jobs build or test.
NON_CODE='^(docs/|[^/]+\.md$|LICENSE$|\.claude/skills/|\.github/(ISSUE_TEMPLATE/|issue-concierge/|aw/|instructions/|scripts/|workflows/[^/]+\.(ya?ml|md)$|issue-concierge\.yml$|CODEOWNERS$|dependabot\.yml$|copilot-instructions\.md$))'

# Files on that list that still count as code: the pipeline and this
# classifier decide what judges a pull request.
ALWAYS_CODE='^\.github/(workflows/pipeline\.yml$|scripts/classify-changes)'

# Files that a guidance test reads or checks (see
# tools/run-guidance-tests.mjs for the tests): decision records, the agent
# entry points, the contributor guide, skills and instruction files.
GUIDANCE='^(docs/decisions/|AGENTS\.md$|CLAUDE\.md$|docs/CONTRIBUTE\.md$|\.claude/skills/|\.github/instructions/)'

files=$(sed '/^[[:space:]]*$/d')
count=$(grep -c . <<<"${files}" || true)

if [ "${count}" -eq 0 ] || [ "${count}" -ge "${LIMIT}" ]; then
  printf 'code=true\nguidance=false\n'
  exit 0
fi

if grep -Eqv "${NON_CODE}" <<<"${files}" || grep -Eq "${ALWAYS_CODE}" <<<"${files}"; then
  printf 'code=true\nguidance=false\n'
elif grep -Eq "${GUIDANCE}" <<<"${files}"; then
  printf 'code=false\nguidance=true\n'
else
  printf 'code=false\nguidance=false\n'
fi
