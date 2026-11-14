#!/usr/bin/env node
// Decides whether a Dependabot pull request may be armed for auto-merge, and arms it (core 0023).
//
//   node scripts/dependabot-auto-merge.mjs --pr <number> [--dry-run]   one pull request (the pull_request trigger)
//   node scripts/dependabot-auto-merge.mjs --all [--dry-run]           every open Dependabot pull request (the daily trigger)
//   --min-age-days <n>   the age that every added version must have (default 7)
//   --now <iso>          the clock, for a dry run against an older day
//   --ignore-state       with --dry-run only: also look at a pull request that is closed or merged
//
// Needs `gh` (GH_TOKEN, GITHUB_REPOSITORY, or --repo <owner/name>) and the npm registry; nothing else, no dependency.
//
// A pull request is armed only if ALL of this holds, and anything doubtful means it is NOT armed:
//   - Dependabot opened it and it is open;
//   - it is an npm pull request: GitHub Actions updates (and any other ecosystem) are never armed, a person merges
//     them, because an action runs with the credentials of our workflows;
//   - every updated dependency is a patch or minor update (`updated-dependencies` block of the head commit message);
//   - no updated dependency has a name that stays manual (eslint, prettier, typescript and what belongs to them);
//   - every package version that the lockfile adds or changes, direct or transitive, was
//     published at least MIN_AGE_DAYS days ago (the cooldown of dependabot.yml only covers what Dependabot proposes);
//     a registry that cannot be read, or a missing publish time, is a refusal;
//   - when REQUIRED_GROUP is set: the pull request belongs to that Dependabot group.
// A pull request that fails only the age test is looked at again by the daily run.
//
// This file is NOT in .github/scripts/: that folder is managed by the Issue Concierge updater.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MIN_AGE_DAYS = 7;

/** The Dependabot group that auto-merge is limited to; null while every group may arm. */
export const REQUIRED_GROUP = null;

/** Names that stay manual: the whole word eslint, prettier or typescript in the scope or in the name. */
export const MANUAL_WORDS = ['eslint', 'prettier', 'typescript'];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a package name stays manual: its scope or its name contains the whole word `eslint`, `prettier` or
 * `typescript` (words are separated by hyphens). `eslint-plugin-import-x`, `@typescript-eslint/parser`, `@eslint/js`
 * and `@ianvs/prettier-plugin-sort-imports` are manual; `axios`, `rimraf` and `@types/node` are not.
 * @param {string} name package name, with its scope if it has one
 * @returns {boolean} true if the name stays manual
 */
export function isManualName(name) {
  const bare = String(name).replace(/^@/, '');
  const [scope, unscoped] = bare.includes('/') ? bare.split('/') : ['', bare];
  return [scope, unscoped]
    .flatMap((part) => String(part).toLowerCase().split('-'))
    .some((word) => MANUAL_WORDS.includes(word));
}

/**
 * The entries of the `updated-dependencies` block that Dependabot writes at the end of its commit message.
 * @param {string} message commit message
 * @returns {{name: string, version?: string, type?: string, updateType?: string, group?: string}[]} the entries
 */
export function parseUpdatedDependencies(message) {
  const lines = String(message).split('\n');
  const start = lines.findIndex((l) => l.trim() === 'updated-dependencies:');
  if (start === -1) return [];
  const entries = [];
  let current;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '...' || line.trim() === '---') break;
    const item = /^-\s+dependency-name:\s*(.+)$/.exec(line);
    if (item) {
      current = { name: unquote(item[1]) };
      entries.push(current);
      continue;
    }
    const pair = /^\s+([a-z-]+):\s*(.*)$/.exec(line);
    if (pair && current) {
      const value = unquote(pair[2]);
      if (pair[1] === 'dependency-version') current.version = value;
      else if (pair[1] === 'dependency-type') current.type = value;
      else if (pair[1] === 'update-type') current.updateType = value;
      else if (pair[1] === 'dependency-group') current.group = value;
    }
  }
  return entries;
}

function unquote(value) {
  const v = String(value).trim();
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v;
}

/**
 * The package name of a `packages` key of a lockfile: what follows the last `node_modules/`.
 * @param {string} lockPath key such as `node_modules/a/node_modules/@s/b`
 * @returns {string | undefined} the name, undefined for the root entry or a workspace path
 */
export function packageNameOfLockPath(lockPath) {
  const marker = 'node_modules/';
  const at = lockPath.lastIndexOf(marker);
  return at === -1 ? undefined : lockPath.slice(at + marker.length);
}

/**
 * The package versions that the head lockfile adds or changes compared with the base lockfile (direct and transitive).
 * A removed entry is not listed. A `link` entry and the root entry are skipped.
 * @param {{packages?: Record<string, {version?: string, link?: boolean}>}} baseLock lockfile of the merge base
 * @param {{packages?: Record<string, {version?: string, link?: boolean}>}} headLock lockfile of the head
 * @returns {{path: string, name: string, version: string, from?: string}[]} the added or changed versions, sorted (`from`: the base version of a changed entry)
 */
export function changedLockVersions(baseLock, headLock) {
  const base = baseLock?.packages ?? {};
  const head = headLock?.packages ?? {};
  const out = [];
  for (const [path, entry] of Object.entries(head)) {
    if (path === '' || entry?.link || typeof entry?.version !== 'string')
      continue;
    const name = packageNameOfLockPath(path);
    if (!name) continue;
    if (base[path]?.version === entry.version) continue;
    out.push({ path, name, version: entry.version, from: base[path]?.version });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The kind of change between two versions, as Dependabot names it.
 * @param {string | undefined} from the old version
 * @param {string} to the new version
 * @returns {'major' | 'minor' | 'patch' | 'unknown'} `unknown` for a missing old version, a prerelease or anything unparsable
 */
export function semverBump(from, to) {
  const parse = (v) => /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? ''));
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return 'unknown';
  if (a[1] !== b[1]) return 'major';
  if (a[2] !== b[2]) return 'minor';
  return a[3] !== b[3] ? 'patch' : 'unknown';
}

/**
 * The update type of a dependency whose pull request has none in its metadata (a security update has none): the
 * widest change of the lockfile entries of that name. `undefined` if the lockfile has no changed entry to compare.
 * @param {string} name the dependency
 * @param {{name: string, version: string, from?: string}[]} changed the lockfile difference
 * @returns {string | undefined} `version-update:semver-<major|minor|patch>`, or undefined
 */
export function derivedUpdateType(name, changed) {
  const bumps = (changed ?? [])
    .filter((c) => c.name === name)
    .map((c) => semverBump(c.from, c.version));
  if (bumps.length === 0 || bumps.includes('unknown')) return undefined;
  const widest = ['major', 'minor', 'patch'].find((b) => bumps.includes(b));
  return `version-update:semver-${widest}`;
}

/**
 * The registry address of a package document (a scoped name needs its slash encoded).
 * @param {string} name package name
 * @returns {string} url
 */
export function registryUrl(name) {
  return `https://registry.npmjs.org/${name.startsWith('@') ? name.replace('/', '%2f') : name}`;
}

/**
 * The publish time of one version in a registry package document.
 * @param {{time?: Record<string, string>} | undefined} packument the document
 * @param {string} version version
 * @returns {number | undefined} milliseconds since the epoch, undefined if unknown or unparsable
 */
export function publishTimeOf(packument, version) {
  const text = packument?.time?.[version];
  const ms = typeof text === 'string' ? Date.parse(text) : NaN;
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * The decision for one pull request. Pure: everything it needs is passed in.
 * @param {object} input what is known about the pull request
 * @param {{name: string, updateType?: string, group?: string}[]} input.updates the `updated-dependencies` entries
 * @param {'npm' | 'github_actions' | string} input.ecosystem the ecosystem of the pull request (from its branch name)
 * @param {{path: string, name: string, version: string}[] | undefined} input.changed the lockfile difference (npm)
 * @param {Record<string, number | undefined>} input.times publish time per `name@version` (npm)
 * @param {Record<string, string>} [input.errors] a read error per `name@version`
 * @param {number} input.now the clock, milliseconds
 * @param {number} [input.minAgeDays] the age every added version must have
 * @param {string | null} [input.requiredGroup] the group that may arm, null for any
 * @returns {{armed: boolean, reasons: string[]}} the verdict; `armed` only with no reason
 */
export function decide({
  updates,
  ecosystem,
  changed,
  times,
  errors = {},
  now,
  minAgeDays = MIN_AGE_DAYS,
  requiredGroup = REQUIRED_GROUP,
}) {
  const reasons = [];
  if (!updates || updates.length === 0) {
    reasons.push('the head commit has no updated-dependencies block');
  }
  for (const u of updates ?? []) {
    if (
      u.updateType !== 'version-update:semver-patch' &&
      u.updateType !== 'version-update:semver-minor'
    ) {
      reasons.push(
        `${u.name} is not a patch or minor update (${u.updateType ?? 'unknown'})`
      );
    }
    if (isManualName(u.name)) {
      reasons.push(`${u.name} stays manual (eslint, prettier or typescript)`);
    }
    if (requiredGroup && u.group !== requiredGroup) {
      reasons.push(
        `${u.name} is not in the group ${requiredGroup} (${u.group ?? 'no group'})`
      );
    }
  }
  if (ecosystem === 'github_actions') {
    reasons.push(
      'GitHub Actions updates are never armed: a person merges them'
    );
  } else if (ecosystem !== 'npm_and_yarn' && ecosystem !== 'npm') {
    reasons.push(
      `the ecosystem ${ecosystem} is never armed: a person merges it`
    );
  } else {
    if (!changed) {
      reasons.push('the lockfile difference could not be read');
    } else if (changed.length === 0) {
      reasons.push('the lockfile difference is empty');
    } else {
      const limit = now - minAgeDays * DAY_MS;
      for (const c of changed) {
        const key = `${c.name}@${c.version}`;
        if (errors[key]) {
          reasons.push(
            `${key}: the registry could not be read (${errors[key]})`
          );
        } else if (times[key] === undefined) {
          reasons.push(`${key}: no publish time`);
        } else if (times[key] > limit) {
          const days = ((now - times[key]) / DAY_MS).toFixed(1);
          reasons.push(
            `${key} was published ${days} days ago, less than ${minAgeDays}`
          );
        }
      }
    }
  }
  return { armed: reasons.length === 0, reasons };
}

/** The Dependabot ecosystem of a pull request from its branch name `dependabot/<ecosystem>/...`. */
export function ecosystemOfBranch(ref) {
  const m = /^dependabot\/([^/]+)\//.exec(String(ref));
  return m ? m[1] : 'unknown';
}

function ghDefault(args, options = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
}

async function fetchJsonDefault(url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

/**
 * Evaluate one pull request against the repository and the registry.
 * @param {object} io what to talk to (replaceable in tests)
 * @param {string} io.repo owner/name
 * @param {number} io.number pull request number
 * @param {(args: string[]) => string} io.gh runs `gh`, returns stdout
 * @param {(url: string) => Promise<any>} io.fetchJson reads json
 * @param {number} io.now clock in milliseconds
 * @param {number} [io.minAgeDays] minimum age
 * @param {Map<string, any>} [io.cache] registry documents already read
 * @param {boolean} [io.ignoreState] evaluate a closed or merged pull request too (a dry run for analysis)
 * @returns {Promise<{number: number, armed: boolean, reasons: string[], alreadyArmed: boolean, checked: number}>} verdict
 */
export async function evaluate({
  repo,
  number,
  gh,
  fetchJson,
  now,
  minAgeDays = MIN_AGE_DAYS,
  cache = new Map(),
  ignoreState = false,
}) {
  const pr = JSON.parse(gh(['api', `repos/${repo}/pulls/${number}`]));
  const result = (armed, reasons, checked = 0) => ({
    number,
    armed,
    reasons,
    alreadyArmed: !!pr.auto_merge,
    checked,
  });
  if (pr.state !== 'open' && !ignoreState)
    return result(false, ['the pull request is not open']);
  if (pr.user?.login !== 'dependabot[bot]')
    return result(false, ['the pull request is not from Dependabot']);
  const ecosystem = ecosystemOfBranch(pr.head?.ref);
  const commits = JSON.parse(
    gh([
      'api',
      `repos/${repo}/pulls/${number}/commits`,
      '--paginate',
      '--slurp',
    ])
  ).flat();
  const message = commits.length
    ? (commits[commits.length - 1].commit?.message ?? '')
    : '';
  const updates = parseUpdatedDependencies(message);

  let changed;
  const times = {};
  const errors = {};
  if (ecosystem === 'npm_and_yarn' || ecosystem === 'npm') {
    try {
      const mergeBase = gh([
        'api',
        `repos/${repo}/compare/${pr.base.sha}...${pr.head.sha}`,
        '--jq',
        '.merge_base_commit.sha',
      ]).trim();
      const raw = (ref) =>
        JSON.parse(
          gh([
            'api',
            '-H',
            'Accept: application/vnd.github.raw',
            `repos/${repo}/contents/package-lock.json?ref=${ref}`,
          ])
        );
      changed = changedLockVersions(raw(mergeBase), raw(pr.head.sha));
    } catch (error) {
      changed = undefined;
    }
    for (const c of changed ?? []) {
      const key = `${c.name}@${c.version}`;
      if (key in times || key in errors) continue;
      try {
        if (!cache.has(c.name))
          cache.set(c.name, await fetchJson(registryUrl(c.name)));
        times[key] = publishTimeOf(cache.get(c.name), c.version);
      } catch (error) {
        errors[key] = String(error?.message ?? error).slice(0, 80);
      }
    }
  }
  for (const u of updates) {
    if (!u.updateType) u.updateType = derivedUpdateType(u.name, changed);
  }
  const verdict = decide({
    updates,
    ecosystem,
    changed,
    times,
    errors,
    now,
    minAgeDays,
  });
  return result(verdict.armed, verdict.reasons, changed?.length ?? 0);
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const repo = arg(argv, '--repo') ?? process.env.GITHUB_REPOSITORY;
  const minAgeDays = Number(arg(argv, '--min-age-days') ?? MIN_AGE_DAYS);
  const now = arg(argv, '--now') ? Date.parse(arg(argv, '--now')) : Date.now();
  if (
    !repo ||
    (!argv.includes('--all') && !arg(argv, '--pr')) ||
    !Number.isFinite(now) ||
    !Number.isFinite(minAgeDays)
  ) {
    console.error(
      'usage: dependabot-auto-merge.mjs (--pr <number> | --all) [--repo owner/name] [--dry-run] [--min-age-days n] [--now iso]'
    );
    return 2;
  }
  const numbers = argv.includes('--all')
    ? JSON.parse(
        ghDefault([
          'pr',
          'list',
          '-R',
          repo,
          '--author',
          'app/dependabot',
          '--state',
          'open',
          '--limit',
          '100',
          '--json',
          'number',
        ])
      ).map((p) => p.number)
    : [Number(arg(argv, '--pr'))];
  const cache = new Map();
  let failed = false;
  for (const number of numbers) {
    const v = await evaluate({
      repo,
      number,
      gh: ghDefault,
      fetchJson: fetchJsonDefault,
      now,
      minAgeDays,
      cache,
      ignoreState: dryRun && argv.includes('--ignore-state'),
    });
    console.log(JSON.stringify(v));
    if (!v.armed) continue;
    if (v.alreadyArmed) {
      console.log(`#${number}: already armed`);
    } else if (dryRun) {
      console.log(`#${number}: would arm auto-merge (dry run)`);
    } else {
      try {
        ghDefault([
          'pr',
          'merge',
          '--auto',
          '--squash',
          '-R',
          repo,
          String(number),
        ]);
        console.log(`#${number}: auto-merge armed`);
      } catch (error) {
        failed = true;
        console.error(
          `#${number}: arming failed: ${String(error?.message ?? error).slice(0, 200)}`
        );
      }
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(String(error?.stack ?? error).slice(0, 500));
      process.exit(1);
    }
  );
}
