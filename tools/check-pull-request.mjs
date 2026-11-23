#!/usr/bin/env node
// Checks the rules a pull request must follow (tools/pull-request-rules.mjs):
// today, that CHANGELOG.md is left alone. `npm run check` runs it, and so does
// the `Lint` step of the required `Build` job, which runs for every pull
// request whatever files changed. Also callable alone:
// `npm run check:pull-request`.
//
// What it compares with:
// - inside a pull_request event (CI): the base commit of the event. A fork that
//   is behind main does not have that commit, so it is fetched from the base
//   repository by its SHA. If the base cannot be resolved the check FAILS (exit
//   2), so the guard is never silently off in CI. A re-run fixes a network flake.
// - no event (a developer or an agent at a terminal): origin/main when it
//   exists, otherwise a note and exit 0. CI is the guard, this is a convenience.
//   Here a change that is staged or edited but not committed yet counts too, so
//   "edit, run check, commit" gets its warning before the commit.
// - any other event (push, workflow_dispatch): a note and exit 0. The Release
//   job's own commit lands on main by push and must pass.
//
// It compares the merge base with HEAD (a three-dot diff): a branch that is
// behind main must not be blamed for what main has gained, for example the
// release commit that changes CHANGELOG.md every day or two. The NET change
// decides, so an edit that a later commit reverts is clean.
//
// Exit codes: 0 ok or skipped, 1 a rule is broken, 2 cannot decide inside a
// pull_request event.
//
// git is run without a shell (execFileSync), so this works the same on Windows.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import {
  formatProblems,
  matchesPaths,
  RULES,
  workflowError,
} from './pull-request-rules.mjs';

const PREFIX = 'check:pull-request:';
const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const FETCH_TIMEOUT_MS = 300000;

/** A reason that the base cannot be resolved or git cannot answer. */
class Undecided extends Error {}

/** A commit id as people read it; a name such as origin/main stays as it is. */
function short(revision) {
  return SHA.test(revision) ? revision.slice(0, 9) : revision;
}

/** Runs git in the current directory and returns its output; throws on a non-zero exit. */
function git(args, { timeout } = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
    timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

/** Does `git <args>` succeed? */
function gitSucceeds(args) {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
}

/** The first line of what a failed git call said. */
function firstLine(error) {
  const text = String(error?.stderr || error?.message || error).trim();
  return text.split(/\r?\n/)[0] || 'no message';
}

/** The base commit of the pull request in the event file, fetched when it is missing. */
function baseOfPullRequest() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Undecided('GITHUB_EVENT_PATH is not set in a pull_request event');
  }
  let event;
  try {
    event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch (error) {
    throw new Undecided(`cannot read the event file: ${firstLine(error)}`);
  }
  const base = event?.pull_request?.base;
  const sha = base?.sha;
  if (typeof sha !== 'string' || !SHA.test(sha)) {
    throw new Undecided('the event has no base commit (pull_request.base.sha)');
  }
  if (gitSucceeds(['cat-file', '-e', `${sha}^{commit}`])) {
    return sha;
  }
  // A fork that is behind has not got the base commit. GitHub serves a commit
  // by its SHA, and git fetches only what is missing.
  const url = base?.repo?.clone_url;
  if (typeof url !== 'string' || url === '') {
    throw new Undecided(
      `the base commit ${sha.slice(0, 9)} is not in this clone and the event names no repository to fetch it from`
    );
  }
  try {
    git(['fetch', '--no-tags', '--quiet', '--', url, sha], {
      timeout: FETCH_TIMEOUT_MS,
    });
  } catch (error) {
    throw new Undecided(
      `cannot fetch the base commit ${sha.slice(0, 9)}: ${firstLine(error)}`
    );
  }
  if (!gitSucceeds(['cat-file', '-e', `${sha}^{commit}`])) {
    throw new Undecided(
      `the base commit ${sha.slice(0, 9)} is still missing after the fetch`
    );
  }
  return sha;
}

/** The commits of the branch (no merges) that touch `pathspec`, with the subject and every file each one changes. */
function commitsTouching(mergeBase, pathspec) {
  const shas = git([
    'log',
    '--no-merges',
    '--full-history',
    '--format=%H',
    `${mergeBase}..HEAD`,
    '--',
    ...pathspec,
  ])
    .split(/\r?\n/)
    .filter(Boolean);
  return shas.map((sha) => ({
    sha,
    // `--` after every revision: a file named like one must not make git ask
    subject: git(['log', '-1', '--format=%s', sha, '--']).trim(),
    files: git([
      'diff-tree',
      '--root',
      '--no-commit-id',
      '--name-only',
      '-r',
      '--no-renames',
      '-z',
      sha,
      '--',
    ])
      .split('\0')
      .filter(Boolean),
  }));
}

/** The files that differ from HEAD in the index or the working tree. */
function uncommittedFiles() {
  return git(['diff', '--name-only', '--no-renames', '-z', 'HEAD', '--'])
    .split('\0')
    .filter(Boolean);
}

/**
 * Prints the answer of every rule; returns 0 or 1. `workingTree`: also look at
 * what is staged or edited but not committed yet (a person at a terminal, not
 * CI, where the commit is what counts).
 */
function checkRules(base, { workingTree = false } = {}) {
  let mergeBase;
  try {
    mergeBase = git(['merge-base', base, 'HEAD']).trim();
  } catch (error) {
    throw new Undecided(
      `no merge base of ${short(base)} and HEAD (a shallow clone? run "git fetch --unshallow"): ${firstLine(error)}`
    );
  }
  // Every file the branch changes against the merge base. No rename detection:
  // a file that is renamed away would show up only under its new name.
  const changed = git([
    'diff',
    '--name-only',
    '--no-renames',
    '-z',
    mergeBase,
    'HEAD',
    '--',
  ])
    .split('\0')
    .filter(Boolean);
  const edited = workingTree ? uncommittedFiles() : [];
  const problems = [];
  for (const rule of RULES) {
    const netChanged = changed.some((file) => matchesPaths(file, rule.paths));
    const uncommitted = edited.some((file) => matchesPaths(file, rule.paths));
    // :(top,literal) so that it works from a subfolder and a name is no pattern
    const pathspec = rule.paths.map((path) => `:(top,literal)${path}`);
    const commits = netChanged ? commitsTouching(mergeBase, pathspec) : [];
    problems.push(...rule.check({ netChanged, commits, uncommitted }));
  }
  if (problems.length === 0) {
    console.log(
      `${PREFIX} ok (rules: ${RULES.map((rule) => rule.id).join(', ')}; merge base ${short(mergeBase)})`
    );
    return 0;
  }
  console.error(formatProblems(problems, { mergeBase: short(mergeBase) }));
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const rule of RULES) {
      if (problems.some((problem) => problem.rule === rule.id)) {
        console.error(
          workflowError(`Pull request rule ${rule.id}`, rule.summary)
        );
      }
    }
  }
  return 1;
}

/** Decides what to compare with and checks the rules; returns the exit code. */
function run() {
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  if (eventName === 'pull_request') {
    return checkRules(baseOfPullRequest());
  }
  if (eventName !== '') {
    console.log(
      `${PREFIX} skipped: a ${eventName} event is not a pull request, so there is nothing to compare.`
    );
    return 0;
  }
  if (
    !gitSucceeds(['rev-parse', '--verify', '--quiet', 'origin/main^{commit}'])
  ) {
    console.log(
      `${PREFIX} skipped: there is no origin/main to compare with. The pull request pipeline runs this check.`
    );
    return 0;
  }
  return checkRules('origin/main', { workingTree: true });
}

const failClosed = process.env.GITHUB_EVENT_NAME === 'pull_request';
try {
  process.exitCode = run();
} catch (error) {
  const reason = error instanceof Undecided ? error.message : firstLine(error);
  if (failClosed) {
    console.error(
      `${PREFIX} cannot decide: ${reason}. Re-run the job; if it fails again, ask a maintainer.`
    );
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.error(
        workflowError('Pull request rules', `cannot decide: ${reason}`)
      );
    }
    process.exitCode = 2;
  } else {
    console.log(
      `${PREFIX} skipped: ${reason}. The pull request pipeline runs this check.`
    );
    process.exitCode = 0;
  }
}
