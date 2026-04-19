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
- in a `success` combined status state for the PR head SHA

## Merge behavior

Each run rebuilds `integration` from `main`, then attempts merge commits (`git merge --no-ff`) for selected PRs.

- On successful merge:
  - remove `integration-batch`
  - remove `integration-failed` (if present)
  - add `integrated`
  - add a comment including the run URL
- On merge conflict:
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
