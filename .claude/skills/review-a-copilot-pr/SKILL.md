---
name: review-a-copilot-pr
description: Use when a maintainer asks you to review a pull request made by a coding agent (for example the GitHub Copilot cloud agent), or any pull request that needs more than reading the diff. A hands-on procedure that fetches the head, builds it, runs what the pull request claims, probes real behaviour in a terminal against a fake tenant, mutation-tests its new tests, checks the design against the issue and the decision records, and ends in a draft review for the maintainer. Includes the rules for handling agent pull requests and their held workflow runs.
---

# Review a pull request made by a coding agent

You are writing a **draft review for a maintainer**. You do not post it, approve workflow runs, push to the pull request's branch or merge unless the maintainer tells you to do that specific thing. The maintainer is the last lever on agent work: core 0002, [a maintainer stays the last lever on agent work](../../../docs/decisions/core/0002-a-maintainer-stays-the-last-lever-on-agent-work.md).

A passing CI run and a green test list are not a review. The aim is to find what the author's own tests would not: a test that cannot fail, an example that does not run, a behaviour that is not the one the issue asked for.

## Rules for agent pull requests

- **Never approve workflow runs yourself.** GitHub holds every run an agent causes until a maintainer approves it, because a branch can carry its own workflow files and a run can use repository secrets. Tell the maintainer which run to approve.
- **Only the pipeline run (`Frodo CLI Release Pipeline`) of the newest commit matters.** The maintainer approves it once the agent has stopped pushing. Runs of older commits are stale (the maintainer deletes them), and `Dependabot Auto-Merge` runs on an agent's pull request are no-ops.
- **Do not recommend approving the runs of a pull request whose design is wrong.** Fix the design first; every push is a new held run.
- **Read any change to `.github/workflows/` before anyone approves a run for that branch.** Say so in the review.
- **A comment that mentions `@copilot` starts a new agent session**, even if it says "stop". Mention the agent only to ask for a real change. To hold or stop work use a plain comment without the mention, or ask the maintainer to use the `plan-approval-required` label on the issue.
- **Check the pull request's state before you push to its branch** (`gh pr view <N> --json state`). If it merged or closed in the meantime, a push creates a stray branch; open a new pull request from `main` instead.
- **Never update snapshots to turn a run green.** Decide whether a changed output is expected or a regression, and say which.
- **Agent pull requests are never merged automatically.** Do not enable auto-merge.
- **Draft every comment, show it to the maintainer, post on their go.** Keep it free of anything sensitive: an edited comment keeps its earlier revisions in its history.

## 1. Understand what was asked

```console
gh pr view <N> --json state,isDraft,headRefOid,headRefName,mergeStateStatus,closingIssuesReferences
gh issue view <issue> --comments            # the report, the plan comment, the labels
```

- Read the **issue and its plan comment**: the design the author intended may live only there, and the agent may not have followed it. The pull request has to do what the issue asked, not only something that works.
- Find the **binding records** for the paths it touches: `git diff --name-only origin/main...pr-<N>`, then the `applies-to` column of [docs/decisions/README.md](../../../docs/decisions/README.md), and the matching `.github/instructions/*.instructions.md`. If the change conflicts with an accepted record, that is a finding, not a style note.

## 2. Get the code in a throwaway checkout

```console
git fetch origin pull/<N>/head:pr-<N>
git worktree add ../review-<N> pr-<N>
cd ../review-<N> && npm ci
git rev-list --count pr-<N>..origin/main     # commits the branch is behind main
git diff --stat origin/main...pr-<N>         # the pull request's own changes (three dots)
```

If it is behind `main`, also review the merge result: `git merge --no-commit --no-ff origin/main` (undo with `git merge --abort`) and run the tests on that. Never review in your working checkout, and do not push from the review checkout.

## 3. Read the whole diff

Not the description, the diff: source, tests, docs, snapshots, lock files, workflow files. Look for:

- tests deleted or weakened, `.skip` added, a legacy-exceptions list that grew (`test/unit/UsageExamplesLegacyExceptions.js` and `UsageExampleOperandsLegacyExceptions.js` only shrink);
- snapshot changes nobody explained;
- a package added to `dependencies` (it must be `devDependencies`), edits to `CHANGELOG.md`, edits to the Repo Concierge's files (see `AGENTS.md`), anything that looks like a key or token;
- business logic added to the CLI that frodo-lib should own ([core 0001](../../../docs/decisions/core/0001-library-is-the-brain-cli-is-a-thin-wrapper.md), cli record 0007), new modules in the deprecated `src/configManagerOps/` layer (cli record 0023), code in `src/ops/` that prompts, prompt code outside `src/utils/interactive/`, direct reads of standard input outside `src/utils/StdinSync.ts`;
- docs that the change makes wrong (`docs/INTERACTIVE-COMMANDS.md`, the usage examples, MIGRATION.md for a removed option).

## 4. Build and run the checks

```console
npx tsdown                               # the test scripts do not rebuild dist/
npm run check
npx tsc --noEmit
npm run test:only -- <the pull request's test files>
npm test                                 # then the whole suite
```

Compare any failure with a clean `main` before calling it pre-existing (a second clone, or `git stash`). If the same suites fail again on a rerun, it is a bug, not a flake. Do not edit `src/` or rebuild `dist/` while a suite runs.

## 5. Run what the pull request claims

Tests that pass prove what the tests check. Run the claim itself.

- **Usage examples:** `frodo <command> -hhh` prints them. The static check only proves the flags exist and the operands are in order. Run each example against a build and confirm it neither waits for input nor fails on its arguments.
- **A fake tenant needs no credentials:** `test/utils/FakeAm.mjs` is a small fake AM. Start it as its own process and point the CLI at it with an empty home directory:

  ```console
  H=$(mktemp -d)
  FAKE_AM_JOURNEY=password FAKE_AM_RECORD=$H/requests.jsonl node test/utils/FakeAm.mjs   # prints PORT=<n>
  HOME=$H FRODO_NO_CACHE=true NODE_OPTIONS= node dist/launch.cjs journey list http://127.0.0.1:<n>/am alpha someone 'secret' </dev/null
  cat $H/requests.jsonl                    # every request the command made
  ```

  Login succeeds and the next request answers 404 on purpose; the request log shows what the command called. `FAKE_AM_REALMS=alpha,bravo` makes the system have several realms (what opens the realm picker); see the header of `FakeAm.mjs` for the other switches.
- **Anything interactive needs a real terminal.** Write a throwaway PTY test as an untracked file in the review checkout, modelled on `test/unit/MfaPrompt.pty.test.js` (`runShellScenario` from `test/utils/ShellPty.js`, `startFakeAm` from `test/utils/StartFakeAm.js`; needs python3). Gotchas with this harness: `wait_plain` scans all output so far, so `clear_output` before waiting for a prompt to reopen; it returns mid-frame, so sleep 300 to 400 ms before capturing; the driver inherits the runner's environment, so `NO_COLOR` (set by Jest, and any value disables colour) is removed only with the `__FRODO_PTY_DELETE__` sentinel, and `FRODO_TEST=1` must be blanked to allow prompting; the terminal is 120 by 40. Check frames at several widths with real colours, not only with `NO_COLOR` set.
- Do not run it against a real tenant unless the maintainer asks.

## 6. Mutation-test the new tests

Do the new tests fail when the code they guard is broken? Write a list of small mutations (flip a condition, drop a branch, change a constant), and let the script apply each one, run the tests, and restore the file:

```console
# from the review checkout; the script is in this skill's folder of your main checkout
python3 <main checkout>/.claude/skills/review-a-copilot-pr/mutation-check.py ../mutations.json \
  --build "npx tsdown" -- npm run test:only -- test/unit/TheNewTest.test.js
```

`mutations.json` is a list of `{"name": ..., "file": ..., "find": ..., "replace": ...}` (`find` must occur exactly once). A mutation that **survives** is a behaviour the tests do not guard: report it. The script checks that every file is back as it was; keep `mutations.json` outside the checkout. Run the script from the review checkout, not from a checkout that has uncommitted work you care about.

## 7. Negative check: revert only the fix

Proves the new tests really exercise the fix. Revert the source change, keep the tests:

```console
git diff origin/main...pr-<N> -- src > ../fix.patch
git apply -R ../fix.patch && npx tsdown
npm run test:only -- <the new tests>        # these must FAIL
git apply ../fix.patch && npx tsdown
npm run test:only -- <the new tests>        # and PASS again
```

If they still pass with the fix reverted, they test nothing. Confirm that you rebuilt the artifact the tests run (`dist/`, or `dist-sea/` for `test:binary`): a first attempt that rebuilt the wrong one "passed" falsely.

## 8. Check CI

```console
gh pr checks <N>
gh run list --branch <head branch> --json databaseId,name,conclusion,headSha,event
gh run view <run id> --log-failed
```

Record the head SHA you reviewed and confirm the run you read is for it. A run for an older commit says nothing, and one held for approval has not run.

## 9. The verdict

Write the draft in plain language for the maintainer, in three parts: **what I ran** (and what I could not run), **findings** ordered blocking, should fix, note, each with the file and line and a way to reproduce it, and **the verdict** (good to go, changes needed, or wrong approach). Say what you did not verify. Include the head commit you reviewed. Do not say "good to go" about something you did not run.

Show the draft to the maintainer. Post it only when they say so, as a plain comment, with the `@copilot` mention only if you are asking the agent for specific changes.

## Stop and ask when

- the pull request changes workflow files, secrets handling or the release pipeline;
- its design conflicts with the issue or an accepted record, and fixing it would change what the maintainer decided;
- you would have to touch a real tenant, a key or a credential to verify it.
