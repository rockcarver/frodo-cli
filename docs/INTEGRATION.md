# Integration Batching Workflow

The [`integration-batch` workflow](../.github/workflows/integration-batch.yml) automates integration branch preparation by batching selected pull requests.

## Labels

- `integration-batch`: PR is queued for integration batching.
- `integrated`: PR was successfully merged into the `integration` branch by automation.
- `integration-failed`: automation attempted integration but hit a merge conflict.
- `integration-needs-snapshot-review`: applied to the generated `integration -> main` PR when snapshot auto-recovery updates snapshot files.

## Selection rules

The workflow selects PRs that are:

- open
- non-draft
- labeled `integration-batch`
- not labeled `integrated`
- with check runs present for the PR head SHA
- with all check runs in `completed` status
- with all completed check runs concluded as `success`, `skipped`, or `neutral`

## Merge behavior

Each run rebuilds `integration` from `main`, then attempts merge commits (`git merge --no-ff`) for selected PRs.

- On successful merge:
  - remove `integration-batch`
  - remove `integration-failed` (if present)
  - add `integrated`
  - add a comment including the run URL
- On merge conflict:
  - if all conflicted files are in the auto-generated union allowlist, conflicts are auto-resolved by union merge
  - if conflicts are snapshot-only (`*.snap` / `__snapshots__`, optionally with `package-lock.json`), merge is completed and targeted `npm run test:update <pattern>` commands are executed, then updated snapshots are committed to `integration`
  - if `package-lock.json` is conflicted (including lockfile-only conflicts), automation checks out one side to complete the merge, runs `npm i --package-lock-only`, and commits the regenerated lockfile to `integration`
  - otherwise merge is aborted, `integration-failed` is applied, and the author is asked to rebase and re-add `integration-batch`

Union allowlist generation runs on every workflow execution:

- includes `src/cli/**` files containing `const program = new FrodoStubCommand(`
- excludes any file containing `const program = new FrodoCommand(`
- applies manual overrides from:
  - `.github/integration/union-allowlist-extra.txt`
  - `.github/integration/union-blocklist.txt`

After merges, the workflow updates `@rockcarver/frodo-lib` to `@next`, commits lockfile changes when needed, pushes `integration`, runs the full test suite on `integration`, and then creates or updates an `integration -> main` PR titled `integration`.

Because `integration` is pushed before the full test suite runs, the branch can be temporarily red until the test stage finishes.

## Dry run mode

When manually triggered, set `dry_run=true` to simulate batching without side effects:

- does not push `integration`
- does not create/update the integration PR
- does not edit labels or post PR comments
- does not run the post-push full test suite on `integration`

The workflow still computes candidate PRs and attempts merges locally so maintainers can validate batchability before a real run.
