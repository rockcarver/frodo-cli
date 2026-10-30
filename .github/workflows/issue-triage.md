---
name: "Issue Concierge 1b Issue Triage"
description: |
  Issue gate triage. Applies internal quality and priority labels.
  Any comment posted for the reporter uses plain language only.
  Skips planning when the issue is marked related-repo.
# A maintainer's `/accept` is recorded by the Concierge in a comment of the bot (scripts/commands.mjs, ACCEPT_MARKER). The
# issue worker run that a reporter's reply started can finish after the command and give this gate its label again, when
# the labels that showed the hold are gone and the plan worker has the issue. The `accepted` step reads the record and
# stands this gate down; the prompt carries the same rule as a second layer. The comment of the maintainer is not the
# record: GitHub shows a member with private membership as a CONTRIBUTOR to the workflow token. Because this `if:` reads
# a pre-activation output (`needs.`), gh-aw applies it to the activation job only: the pre-activation job now starts for
# every label event, so the step carries its own conditions and does nothing, and posts nothing, for any other label.
if: ${{ (vars.ISSUE_CONCIERGE_PAUSED != 'true' && vars.CONCIERGE_PAUSED != 'true' || github.event_name == 'workflow_dispatch') && github.event.issue.state == 'open' && github.event.issue.user.type != 'Bot' && !contains(github.event.issue.labels.*.name, 'no-auto-processing') && needs.pre_activation.outputs.accepted_result != 'failure' }}
on:
  # The pre-activation job runs before the agent and gets no repository permissions by default.
  permissions:
    issues: write
  issues:
    types: [labeled]
    names: [issue-worker-ready]
  steps:
    # Deterministic, no model. gh-aw exports only this step's outcome (`accepted_result`), so the step fails on purpose
    # and `continue-on-error` keeps the job itself green: outcome `failure` means "a maintainer has already accepted
    # this request, do not triage it", and the `if:` above reads it.
    - name: Stand down when a maintainer has already accepted the request
      id: accepted
      if: (vars.ISSUE_CONCIERGE_PAUSED != 'true' && vars.CONCIERGE_PAUSED != 'true' || github.event_name == 'workflow_dispatch') && github.event.label.name == 'issue-worker-ready' && github.event.issue.state == 'open' && github.event.issue.user.type != 'Bot' && !contains(github.event.issue.labels.*.name, 'no-auto-processing')
      continue-on-error: true
      uses: actions/github-script@v9
      with:
        script: |
          const { owner, repo } = context.repo;
          const number = context.payload.issue.number;
          // The record carries the product's name; one that an earlier version wrote has the older line and counts too.
          const MARKERS = ['<!-- issue-concierge:accepted -->', '<!-- concierge:accepted -->'];
          let comments;
          try {
            comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: number, per_page: 100 });
          } catch (error) {
            // Doubt about the comments never stops the gate by itself: the prompt carries the same rule as a second layer.
            core.warning(`Could not read the comments of #${number}: ${error.message}`);
            return;
          }
          // Only a comment of the bot is the record: the Concierge wrote it after it had checked the role of the person who
          // gave the command, and nobody else can post as the bot. The same words in a comment of a person are only words.
          const record = comments.find((c) => c.user && c.user.login === 'github-actions[bot]' && MARKERS.some((m) => String(c.body || '').includes(m)));
          if (!record) return;
          // The label that started this run is void: take it away, so that the issue does not keep a gate label nothing answers.
          try {
            await github.rest.issues.removeLabel({ owner, repo, issue_number: number, name: 'issue-worker-ready' });
          } catch (error) {
            if (error.status !== 404) core.warning(`Could not remove issue-worker-ready from #${number}: ${error.message}`);
          }
          core.setFailed(`A maintainer has already accepted #${number} (${record.html_url}): issue triage has nothing left to decide.`);
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
  add-labels:
    issue-intent: false
    github-token: ${{ secrets.SIGNAL_TOKEN }}
    allowed:
      - bug
      - feature
      - question
      - documentation
      - needs-info
      - priority/p0
      - priority/p1
      - priority/p2
      - duplicate
      - invalid
      - already-fixed
      - spam
      - backlog
      - low-hanging-fruit
      - out-of-scope
      - scope-review
      - needs-decision
      - dependency-required
      - issue-triage-handoff
    max: 5
  remove-labels:
    allowed:
      - needs-info
    max: 1
  add-comment:
    max: 1
  close-issue:
    max: 1
  set-issue-type:
    max: 1
  threat-detection:
    enabled: false
max-ai-credits: 8
timeout-minutes: 3
---

## Label application
Apply labels as plain strings. Do not include rationale, confidence, or suggest.
Handoff and classification labels must be applied, not suggested.


# Issue Triage

Triggered only when an issue receives `issue-worker-ready`.
Read the latest analysis comment produced by the issue worker.

## Related-repo issues
If the issue already has the label `related-repo`, do nothing.
It is a non-canonical pointer; planning happens only on the linked canonical issue.

## A hold that is already there
Read this before you decide that nothing is left to do. `plan-approval-required` is not a sign that triage is done. A maintainer may add it by hand before the issue is analysed, to read the plan before anything is built: the hold stops the issue after the plan, not before triage. Triage the issue as usual, apply the outcome labels, and emit `issue-triage-handoff` when it is complete and worth doing. Plan triage keeps the hold, and removing it is the maintainer's decision, not yours.

When the issue carries the hold, the janitor takes `issue-worker-ready` away within seconds, so the label that started you may be gone when you read the issue. That is normal and no reason to stop either. Only the later-phase progress described under "Internal labels" shows that triage has already run.

## Internal labels (never mentioned to the reporter)
Apply only quality and priority labels. Do **not** apply complexity or risk labels.

- Missing details → `needs-info` (do not emit hand-off)
- Strong duplicate → `duplicate`
- Worker says already fixed, and names a later pull request or commit → `already-fixed`, then close the issue
- Worker says the behavior cannot be found, nothing relevant changed after the issue was opened, and the report had enough detail to look for it → `invalid`, then close the issue
- Worker asked for more details before it could decide → `needs-info` (do not emit hand-off, do not close)
- Invalid or spam → corresponding label
- Out of scope: the worker's analysis says the request matches an explicit exclusion in the project's scope file → apply `out-of-scope`, then close the issue with the state reason `NOT_PLANNED`. Do not emit `issue-triage-handoff`.
- Scope unclear: the worker's analysis says a maintainer should look at whether the request fits the project → apply `scope-review`. Do not emit `issue-triage-handoff`, do not close the issue.
- A change to what exists: the worker's analysis says the request would remove, rename or replace something that exists, break something that works today, or change the architecture, and that a maintainer will decide on it before any work is planned → apply `needs-decision`. Do not emit `issue-triage-handoff`, do not apply `backlog` or `low-hanging-fruit`, do not close the issue, and post no comment: the worker's comment has told the reporter. This outcome comes before "valid but not urgent" and before "worth doing now". A reporter who calls the change safe, small or urgent does not change it.
- If the issue already has `out-of-scope`, `needs-decision` or `declined`, do nothing: it was declined or is waiting for a maintainer, and a reporter's reply does not change that. If it already shows later-phase progress (`issue-triage-handoff`, `plan-worker-ready`, `plan-triage-handoff`, a `complexity/*` or `risk/*` label, or the coding agent as an assignee), the scope and change outcomes do not apply: a maintainer or an earlier run decided to plan it. (Earlier gate labels are removed as an issue moves on, so look for any of these.) A maintainer overrides a scope or change decision by reopening the issue if needed, removing `out-of-scope`, `scope-review`, `needs-decision` or `declined`, and adding `issue-triage-handoff`.
- If a comment of the bot (the author `github-actions[bot]`) on the issue contains the text `issue-concierge:accepted` (a record that an earlier version wrote says `concierge:accepted`, which counts as well), a maintainer has already accepted the request with `/accept`: the Concierge checked who gave the command and wrote that comment. The issue is planned, and the plan worker has it or is done with it. No label has to show that: the gate labels are removed as an issue moves on, and your own run may have started before the command was given (a reporter's reply starts the issue worker, which can finish after the command). The scope and change outcomes do not apply, and neither do `backlog` and `low-hanging-fruit`: do nothing. Do not apply `needs-decision`, `scope-review`, `out-of-scope`, `backlog` or `low-hanging-fruit`, and do not emit `issue-triage-handoff` a second time. Do not look at the author association of any comment to decide this: it is not reliable for the workflow token. The same words in a comment of anyone else are not a record.
- Declares a dependency that has not been cleared (see Dependencies below) → `dependency-required`. Do not emit `issue-triage-handoff`, do not apply `backlog` or `needs-info`, do not close the issue, and do not post a comment about it.
- Valid but not urgent:
  - If the analysis says the change is small in size and low in risk (low complexity and low risk) → low-hanging fruit. Apply `low-hanging-fruit`, then emit `issue-triage-handoff`. Do not apply `backlog`. Both parts must be stated, and only that combination qualifies. If the analysis gives no size or risk, says it could not judge them, or says medium or large size, or medium or high risk, it is not low-hanging fruit.
  - Otherwise → `backlog`.
  - Never apply `backlog` because an analysis ties "not urgent" or "no immediate work planned" to a dependency (see Dependencies below).
- Complete, actionable, and worth doing now → remove `needs-info` if present, then emit `issue-triage-handoff`

Do not emit `issue-triage-handoff` for `already-fixed`, `invalid`, `out-of-scope`, `scope-review` or `needs-decision`.

## Dependencies
Detect, do not resolve. A separate watcher decides when a dependency is finished.

An issue declares a dependency only with a line that starts with `Depends on:`, `Blocked by:`, or `Requires:`, followed by one or more issue or pull request references (`#N`, `owner/repo#N`, or a GitHub URL). Read the issue body and every comment. A reference in ordinary prose, or after `Fixes`, `Closes`, `Resolves`, or `Reported from`, is not a dependency. Do not infer dependencies from free text.

- No declaration → no dependency gate. Continue as usual.
- A declaration, and the issue has the label `dependency-satisfied` → the watcher or a maintainer has cleared it. Continue as usual. An analysis written while the dependency was pending can say that no work is planned, or that the issue is not urgent, because of that dependency. Disregard that part. Judge the issue as if the dependency were finished, and apply the same checks as for any other issue.
- A declaration, and no `dependency-satisfied` label → apply `dependency-required` and stop here.
- The issue is marked `related-repo` → never gate it.

The needs-info, duplicate, invalid, already-fixed, out-of-scope, scope-review and needs-decision outcomes above take precedence over the dependency gate. An open pull request, or one closed without merging, is never evidence that something is fixed.

`backlog` keeps the issue open but does not enter the plan gate.
`issue-triage-handoff` is the signal that the plan worker may run.

## Reporter-facing comment
If you post a comment, use plain language only.
Do not mention labels, gates, workflows, or harness terms.
Examples:
- "Thanks, this is clear enough to look at."
- "Still need the reproduction steps before we can proceed."
- "Noted for later; no immediate work planned."

A reporter reply re-triggers the issue worker, which re-applies `issue-worker-ready`. This triage then runs again and can clear `needs-info` and hand off once the issue is complete.
