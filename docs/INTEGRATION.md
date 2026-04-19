# Integration Batching Workflow

The [`integration-batch` workflow](../.github/workflows/integration-batch.yml) automates integration branch preparation by batching selected pull requests.

## Labels

- `integration-batch`: PR is queued for integration batching.
- `integrated`: PR was successfully merged into the `integration` branch by automation.
- `integration-failed`: automation attempted integration but hit a merge conflict.

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

- Merge conflict auto-recovery is handled by [`.github/integration/scripts/merge_prs.sh`](../.github/integration/scripts/merge_prs.sh):
  - union auto-resolution is applied only to an allowlist of `src/cli/**` command files that instantiate `FrodoStubCommand` (excluding files that instantiate `FrodoCommand`), plus manual overrides from:
    - `.github/integration/union-allowlist-extra.txt`
    - `.github/integration/union-blocklist.txt`
  - snapshot conflicts (`*.snap` and `__snapshots__/`) are auto-resolved enough to complete the merge, then targeted snapshot refresh runs via `npm run test:update <pattern>` where `<pattern>` is derived from conflicted snapshot filenames
  - `package-lock.json` conflicts are always auto-recovered by regenerating lockfile content with `npm i --package-lock-only`
- On successful merge:
  - remove `integration-batch`
  - remove `integration-failed` (if present)
  - add `integrated`
  - add a comment including the run URL
- On merge conflict that is not auto-resolvable by the script:
  - abort merge
  - remove `integration-batch`
  - add `integration-failed`
  - add a comment asking the author to rebase and re-add `integration-batch`

After merges, the workflow updates `@rockcarver/frodo-lib` to `@next`, commits lockfile changes when needed, pushes `integration`, and creates or updates an `integration -> main` PR titled `integration`.

## Dry run mode

When manually triggered, set `dry_run=true` to simulate batching without side effects:

- does not push `integration`
- does not create/update the integration PR
- does not edit labels or post PR comments

The workflow still computes candidate PRs and attempts merges locally so maintainers can validate batchability before a real run.
