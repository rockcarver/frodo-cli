---
name: "Concierge 4c Waiting for Release"
description: |
  When an issue is closed by a merged pull request, mark it waiting for a release.
# Nothing waits for a release when nobody closed the issue with a pull request or a commit: a maintainer
# closing it by hand (already fixed on main, not planned, duplicate). The step below reads the live `closed`
# event before activation and fails on purpose in that case, at no model cost; see docs/multi-phase-design.md,
# "Which closes count". Because this `if:` reads a pre-activation output (`needs.`), gh-aw applies it to the
# activation job only: the pre-activation job now starts for every close, so the step carries its own
# conditions. A lookup that cannot be made never blocks the agent (the prompt applies the same rule).
if: >-
  ${{ github.event.issue.user.type != 'Bot'
  && !contains(github.event.issue.labels.*.name, 'no-auto-processing')
  && needs.pre_activation.outputs.closed_by_merge_result != 'failure' }}
on:
  # The pre-activation job runs before the agent and gets no repository permissions by default.
  permissions:
    issues: read
    pull-requests: read
  issues:
    types: [closed]
  steps:
    # Deterministic, no model. gh-aw exports only this step's outcome (`closed_by_merge_result`), so the
    # step fails on purpose and `continue-on-error` keeps the job itself green: outcome `failure` means
    # "nothing is waiting for a release here", and the `if:` above reads it.
    - name: Stop when no pull request or commit closed the issue
      id: closed_by_merge
      if: github.event.issue.user.type != 'Bot' && !contains(github.event.issue.labels.*.name, 'no-auto-processing')
      continue-on-error: true
      uses: actions/github-script@v9
      with:
        script: |
          const { owner, repo } = context.repo;
          const number = context.payload.issue.number;
          let event;
          try {
            const data = await github.graphql(
              `query($owner: String!, $repo: String!, $number: Int!) {
                repository(owner: $owner, name: $repo) {
                  issue(number: $number) {
                    timelineItems(last: 1, itemTypes: [CLOSED_EVENT]) {
                      nodes {
                        ... on ClosedEvent {
                          stateReason
                          closer {
                            __typename
                            ... on PullRequest { number merged }
                            ... on Commit { oid }
                          }
                        }
                      }
                    }
                  }
                }
              }`,
              { owner, repo, number }
            );
            event = data.repository.issue.timelineItems.nodes[0];
          } catch (error) {
            // Doubt never blocks the agent: a missing label is harmless, a silent stall hides the gate.
            core.warning(`Could not read the closing event of #${number}: ${error.message}`);
            return;
          }
          if (!event) {
            core.warning(`No closing event found for #${number} yet: leaving the decision to the agent.`);
            return;
          }
          if (event.stateReason === 'NOT_PLANNED' || event.stateReason === 'DUPLICATE') {
            core.setFailed(`#${number} was closed as ${event.stateReason.toLowerCase()}: nothing waits for a release.`);
            return;
          }
          if (!event.closer) {
            core.setFailed(`#${number} was closed by hand, with no pull request or commit: nothing waits for a release.`);
            return;
          }
          if (event.closer.__typename === 'PullRequest' && !event.closer.merged) {
            core.setFailed(`#${number} was closed by pull request #${event.closer.number}, which is not merged.`);
            return;
          }
          core.info(`#${number} was closed by ${event.closer.__typename === 'PullRequest' ? `pull request #${event.closer.number}` : `commit ${event.closer.oid}`}.`);
engine:
  id: copilot
  model: small
max-turns: 8
permissions:
  contents: read
  issues: read
  pull-requests: read
tools:
  bash: false
  cli-proxy: false
  github:
    min-integrity: none
safe-outputs:
  add-comment:
    max: 1
  add-labels:
    github-token: ${{ secrets.SIGNAL_TOKEN }}
    allowed:
      - waiting-for-release
    max: 1
  threat-detection:
    enabled: false
max-ai-credits: 8
timeout-minutes: 5
---

# Waiting for release

Triggered when an issue is closed. A step before you already skipped the issues that nobody closed with a pull request or a commit (closed by hand, as not planned, or as a duplicate), so a closing pull request normally exists. Confirm it once; do not research.

You have 8 model calls in all, and a retry after an error counts as one. A normal run needs about four. Do not call `search_repositories`. Make each lookup once and never read the same issue or pull request twice: what you have read stays in front of you.

## Task
1. Read the issue once (`issue_read`, method `get`, and its comments in the same step). If it is still open, or it was closed as not planned or as a duplicate, call `noop` and stop.
2. Find the pull request that closed it once: one `search_pull_requests` query for merged pull requests that name the issue number. If the issue was closed with `Fixes`, `Closes` or `Resolves`, or by a linked merged pull request, that is the one.
3. Read that pull request once (`pull_request_read`, method `get`). You only need its number and when it was merged. Do not read its files, reviews, comments or diff.
4. Read the releases once (`list_releases`, 5 at most). If a release was published after the merge, the fix is already released: call `noop` and stop.
5. Otherwise, in the same step:
   - Add the label `waiting-for-release`.
   - Post a plain-language comment: "Fixed in {pr}. Waiting for a release that includes this."

If you have used 6 of your 8 calls and have not found a merged pull request that closed the issue, call `noop` and stop. Never keep researching. If it was closed for another reason (duplicate, not planned, already released, or by hand with no pull request), do nothing: call `noop`.

Do not mention labels or internal terms in the comment.
