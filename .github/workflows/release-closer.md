---
name: "Concierge 4d Release Closer"
description: |
  When a release is published, mark included issues as released.
# The release notes are written for people and name only the changes they describe, so a fix that has no
# entry in them (a test, a documentation change) is invisible to a model that reads the notes: frodo-lib#762
# was fixed in #775, which is part of v5.0.0-13, and stayed `waiting-for-release` after that release. What a
# release contains is a question for git, not for a model: the `included_fixes` step below runs before the
# agent, with no model, and moves every issue whose `Fixed in #N.` comment (written by the Waiting for Release
# gate) names a pull request whose merge commit is an ancestor of the tag. The agent then finds the labels of
# those issues gone and checks the rest by the notes (docs/multi-phase-design.md, "Which fixes a release contains").
on:
  release:
    types: [published, prereleased]
  # The pre-activation job runs before the agent and gets no repository permissions by default. The step
  # swaps a label and posts one comment, so it needs `issues: write`; it reads pull requests and compares commits.
  permissions:
    issues: write
    pull-requests: read
    contents: read
  steps:
    # Deterministic, no model, and never blocking: a failure here is a warning, because the agent still has
    # to run for the issues this step cannot decide (the notes name them, or a related repository holds the fix).
    - name: Move the issues whose fix pull request is part of this release
      id: included_fixes
      continue-on-error: true
      uses: actions/github-script@v9
      with:
        script: |
          const { owner, repo } = context.repo;
          const tag = context.payload.release.tag_name;
          const WAITING = 'waiting-for-release';
          const RELEASED = 'released';
          let issues;
          try {
            issues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, labels: WAITING, state: 'all', per_page: 100 });
          } catch (error) {
            core.warning(`Could not list the issues that wait for a release: ${error.message}`);
            return;
          }
          for (const issue of issues) {
            if (issue.pull_request) continue;
            const names = (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name));
            // An issue that carries no-auto-processing is a person's: no label, no comment, no close ("Opting an item out").
            if (names.includes('no-auto-processing')) continue;
            // An issue linked to a related repository is decided by the agent, from the version this repository pins.
            if (names.includes('related-repo')) continue;
            try {
              // Only the comment the Waiting for Release gate wrote counts. Anyone can type "Fixed in #N."
              const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: issue.number, per_page: 100 });
              let fix;
              for (const comment of comments) {
                if (comment.user?.login !== 'github-actions[bot]') continue;
                const found = (comment.body ?? '').match(/^Fixed in #(\d+)\./m);
                if (found) fix = Number(found[1]);
              }
              if (!fix) continue;
              const { data: pull } = await github.rest.pulls.get({ owner, repo, pull_number: fix });
              if (!pull.merged || !pull.merge_commit_sha) continue;
              // `ahead`: the tag is ahead of the merge commit, so the merge commit is one of its ancestors.
              const { data: compared } = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${pull.merge_commit_sha}...${tag}` });
              if (compared.status !== 'ahead' && compared.status !== 'identical') continue;
              // Order matters if a call fails half way: `released` first, then the label that is waiting, then the
              // comment. An issue that already has `released` only loses the waiting label, and says nothing twice.
              const done = names.includes(RELEASED);
              if (!done) await github.rest.issues.addLabels({ owner, repo, issue_number: issue.number, labels: [RELEASED] });
              try {
                await github.rest.issues.removeLabel({ owner, repo, issue_number: issue.number, name: WAITING });
              } catch (error) {
                if (error.status !== 404) throw error;
              }
              if (!done) await github.rest.issues.createComment({ owner, repo, issue_number: issue.number, body: `Included in ${tag}.` });
              core.info(`#${issue.number}: its fix, #${fix}, is part of ${tag}.`);
            } catch (error) {
              core.warning(`#${issue.number}: ${error.message}`);
            }
          }
engine:
  id: copilot
  model: small
max-turns: 8
permissions:
  contents: read
  issues: read
tools:
  bash: false
  cli-proxy: false
  github:
    min-integrity: none
safe-outputs:
  add-comment:
    max: 5
    target: "*"
  add-labels:
    github-token: ${{ secrets.SIGNAL_TOKEN }}
    allowed:
      - released
    max: 5
    target: "*"
  remove-labels:
    allowed:
      - waiting-for-release
    max: 5
    target: "*"
  close-issue:
    max: 5
    target: "*"
  threat-detection:
    enabled: false
max-ai-credits: 8
timeout-minutes: 4
---

# Release closer

Triggered when a release is published. This repository does not create releases. A maintainer does.

## Which release

This run was started by the release tagged `${{ github.event.release.tag_name }}`. That release is the only one you check.

- Read it with `get_release_by_tag` and exactly that tag, and use its notes. If the tool returns nothing, call `noop` and say so. Do not look at any other release.
- Never use `get_latest_release`. It skips prereleases and returns the newest stable release, which is not the release that started this run.
- A prerelease is a release. Check it the same way.

## Which issues to check

Issues that wait for a release are usually **closed**: the pipeline closes an issue when its pull request merges and then adds `waiting-for-release`. Open issues with the label are the ones that wait on a related repository.

List issues with `waiting-for-release` in both states. Call `list_issues` with `state: CLOSED` and again with `state: OPEN`, and check every issue from both lists. Never search only open issues, and never skip an issue because it is closed.

Skip every issue that also carries `no-auto-processing`, in either list and in both sections below: a maintainer handles it by hand. Do not read it, label it, comment on it or close it, and do not mention it.

## This repository owns the fix

A step before this run has already moved the issues whose fix pull request is part of this release, so they no longer carry `waiting-for-release`. Do not look for them. Find the issues that still have `waiting-for-release` and that this release includes.

A mention counts when:
- The release notes mention the issue number, or
- The release notes mention a pull request, and that pull request closes the issue (`Fixes`, `Closes`, or `Resolves`).

For each:
1. Remove `waiting-for-release`.
2. Add `released`.
3. Post: "Included in {tag}."

Do not reopen a closed issue.

## This repository consumes the fix

Read `.github/agentic-workflows/related-repos.md`.
Apply this only when an entry sets `release.requires_consumer_release: true`.

1. Read the published release notes and the version of each pinned package (`release.pins`).
2. Find issues here with `waiting-for-release`.
3. This release includes the fix only when it pins the related version that contains it, or the notes mention this issue.
   If the pin does not include the fix, leave the issue as it is.
4. When it is included:
   - Remove `waiting-for-release`.
   - Add `released`.
   - Post: "Included in {tag}, which pins {package} {version}."
   - Close the issue if it is still open.

Do not mention labels or internal terms in the comment.
