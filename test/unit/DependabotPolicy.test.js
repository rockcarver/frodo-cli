import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';

/**
 * The Dependabot policy of core 0023 (docs/decisions/core/0023-...md) says which
 * packages merge without a person: only the `tooling` group of
 * .github/dependabot.yml, and never a package that ends up in what we ship (a
 * "bundled" package: every package that shipped source imports, and the pin of
 * @rockcarver/frodo-lib). The tooling list is a list of names kept by hand, so
 * this test keeps it honest: a bundled package cannot slip into it by a
 * pattern, a dead pattern fails, the cooldown and the workflow agree with the
 * file. It does not judge whether a package should be tooling.
 *
 * The decision itself is made by the shared action
 * gearsnlevers/dependabot-auto-merge-action, which reads the tooling list from
 * this repository's dependabot.yml, so the list cannot drift from a copy of it.
 * What stays here is what only this repository can check: what it ships.
 */

/** The group of dependabot.yml that may be armed (core 0023). */
const REQUIRED_GROUP = 'tooling';
/** The age in days that the cooldown of dependabot.yml and the action both ask for (core 0023). */
const MIN_AGE_DAYS = 7;
/** The words that keep a package manual: Prettier, TypeScript and ESLint with their plugins and configs (core 0023). */
const MANUAL_WORDS = ['eslint', 'prettier', 'typescript'];

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PIN = '@rockcarver/frodo-lib';
/** The bundler that writes the shipped file: it is treated like a bundled package (core 0023). */
const BUNDLER = 'tsdown';

/** Whether a name stays manual: a whole word of it (split at `/`, `@` and `-`) is eslint, prettier or typescript. */
export function isManualName(name) {
  return String(name)
    .toLowerCase()
    .split(/[/@-]+/)
    .some((word) => MANUAL_WORDS.includes(word));
}

/** A Dependabot pattern: `*` matches any run of characters. */
export function matchesPattern(name, pattern) {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`).test(name);
}

/**
 * The `updates` of dependabot.yml, as far as the policy needs them: per ecosystem the cooldown
 * (`default-days`, `exclude`) and the groups with their `patterns`. A reader for the shapes this
 * file uses; it fails loudly on anything else instead of guessing.
 */
export function readUpdates(text) {
  const updates = [];
  let current;
  let block;
  let group;
  let list;
  for (const raw of text.split('\n')) {
    if (/^\s*#/.test(raw) || raw.trim() === '') continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    const entry = /^- package-ecosystem:\s*"?([^"]+)"?$/.exec(line);
    if (entry && indent === 2) {
      current = { ecosystem: entry[1], cooldown: { exclude: [] }, groups: {} };
      updates.push(current);
      block = group = list = undefined;
      continue;
    }
    if (!current) continue;
    if (indent === 4) {
      block = line.replace(/:$/, '');
      group = list = undefined;
      continue;
    }
    if (block === 'cooldown') {
      const days = /^default-days:\s*(\d+)$/.exec(line);
      if (days) current.cooldown.days = Number(days[1]);
      if (line === 'exclude:') list = current.cooldown.exclude;
      else if (/^- /.test(line) && list) list.push(unquote(line.slice(2)));
      continue;
    }
    if (block === 'groups') {
      if (indent === 6 && line.endsWith(':')) {
        group = line.slice(0, -1);
        current.groups[group] = { patterns: [] };
        list = undefined;
      } else if (group && line === 'patterns:') {
        list = current.groups[group].patterns;
      } else if (group && /^[a-z-]+:$/.test(line)) {
        list = undefined;
      } else if (group && /^- /.test(line) && list) {
        list.push(unquote(line.slice(2)));
      }
    }
  }
  return updates;
}

function unquote(value) {
  const v = value.trim();
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v;
}

/** The packages that source files under src/ (not tests) import, as package names. */
export function importedPackages(root) {
  const found = new Set();
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else if (
        /\.(ts|mts|cts|js|mjs|cjs)$/.test(item.name) &&
        !/\.d\.ts$/.test(item.name) &&
        !/\.(test|spec)\./.test(item.name)
      ) {
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(
          /(?:from|import|require\(|import\()\s*['"]([^'".][^'"]*)['"]/g
        )) {
          if (m[1].startsWith('node:')) continue;
          found.add(
            m[1].startsWith('@')
              ? m[1].split('/').slice(0, 2).join('/')
              : m[1].split('/')[0]
          );
        }
      }
    }
  };
  walk(path.join(root, 'src'));
  return found;
}

const pkg = JSON.parse(read('package.json'));
const devDependencies = Object.keys(pkg.devDependencies);
const updates = readUpdates(read('.github/dependabot.yml'));
const npm = updates.find((u) => u.ecosystem === 'npm');
const actions = updates.find((u) => u.ecosystem === 'github-actions');
const tooling = npm?.groups?.[REQUIRED_GROUP]?.patterns ?? [];
const imported = importedPackages(ROOT);
const bundled = [
  ...new Set([
    ...[...imported].filter((name) => devDependencies.includes(name)),
    PIN,
  ]),
].sort();

describe('the reader of dependabot.yml and the pattern matcher', () => {
  it('matches a Dependabot pattern, `*` being any run of characters', () => {
    expect(matchesPattern('@types/node', '@types/*')).toBe(true);
    expect(matchesPattern('axios', '@types/*')).toBe(false);
    expect(matchesPattern('rimraf', 'rimraf')).toBe(true);
    expect(matchesPattern('rimraf-x', 'rimraf')).toBe(false);
    expect(matchesPattern('ts-jest', 'jest')).toBe(false);
    expect(matchesPattern('a.b', 'a.b')).toBe(true);
    expect(matchesPattern('axb', 'a.b')).toBe(false);
  });

  it('keeps a package manual when a whole word of its name is eslint, prettier or typescript', () => {
    for (const name of [
      'eslint',
      'prettier',
      'typescript',
      'eslint-plugin-import-x',
      'prettier-plugin-sh',
      '@typescript-eslint/parser',
      '@eslint/js',
      'ESLint-config-x',
    ]) {
      expect([name, isManualName(name)]).toEqual([name, true]);
    }
    for (const name of [
      'ts-jest',
      'tsdown',
      'prettierx',
      'typescripts',
      'jest',
      '@types/node',
      '',
    ]) {
      expect([name, isManualName(name)]).toEqual([name, false]);
    }
  });

  it('reads the ecosystems, the cooldown and the groups of the file', () => {
    expect(updates.map((u) => u.ecosystem)).toEqual(['npm', 'github-actions']);
    expect(Object.keys(npm.groups)).toEqual([REQUIRED_GROUP]);
    expect(tooling.length).toBeGreaterThan(0);
    expect(npm.cooldown.days).toBeGreaterThan(0);
  });

  it('finds the packages that shipped source imports', () => {
    expect(imported.has('commander')).toBe(true);
    expect(imported.has('@rockcarver/frodo-lib')).toBe(true);
    expect(imported.has('jest')).toBe(false);
  });
});

describe('core 0023: only tooling merges without a person', () => {
  it('the workflow limits auto-merge to a group that dependabot.yml defines, and to no other', () => {
    expect(Object.keys(npm.groups)).toEqual([REQUIRED_GROUP]);
    expect(actions.groups).toEqual({});
  });

  it('no bundled package matches the tooling list', () => {
    const swallowed = bundled.filter((name) =>
      tooling.some((pattern) => matchesPattern(name, pattern))
    );
    expect(swallowed).toEqual([]);
  });

  it('every tooling pattern matches a devDependency (no dead pattern)', () => {
    const dead = tooling.filter(
      (pattern) =>
        !devDependencies.some((name) => matchesPattern(name, pattern))
    );
    expect(dead).toEqual([]);
  });

  it('no tooling pattern matches a name that stays manual, or the library pin', () => {
    const matched = devDependencies.filter((name) =>
      tooling.some((pattern) => matchesPattern(name, pattern))
    );
    expect(matched.filter((name) => isManualName(name))).toEqual([]);
    expect(matched).not.toContain(PIN);
  });

  it('the bundler is not tooling: no pattern matches it, so each update of it is a pull request for a person', () => {
    expect(devDependencies).toContain(BUNDLER);
    expect(
      tooling.filter((pattern) => matchesPattern(BUNDLER, pattern))
    ).toEqual([]);
  });

  it('the cooldown is the age that the auto-merge asks for, and excludes only what is ours', () => {
    expect(npm.cooldown.days).toBe(MIN_AGE_DAYS);
    expect(actions.cooldown.days).toBe(MIN_AGE_DAYS);
    expect(npm.cooldown.exclude).toEqual([PIN]);
    expect(actions.cooldown.exclude).toEqual(['gearsnlevers/*']);
  });
});

describe('the workflow that calls the shared action', () => {
  const workflow = read('.github/workflows/dependabot-auto-merge.yml');
  const uses = [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)].map(
    (m) => ({ ref: m[1], rest: m[2] })
  );

  it('calls the shared action, pinned by a full commit SHA with its version in a comment', () => {
    expect(uses).toHaveLength(1);
    expect(uses[0].ref).toMatch(
      /^gearsnlevers\/dependabot-auto-merge-action@[0-9a-f]{40}$/
    );
    expect(uses[0].rest).toMatch(/#\s*v\d+\.\d+\.\d+/);
  });

  it('checks out nothing: the token has write access and no code of a pull request may run next to it', () => {
    expect(workflow).not.toMatch(/actions\/checkout/);
  });

  it('only a Dependabot pull request is looked at, by the guard on the actor', () => {
    expect(workflow).toContain(
      "if: github.event_name != 'pull_request' || github.actor == 'dependabot[bot]'"
    );
  });

  it('asks for the two permissions that arming needs and nothing more', () => {
    const block = /^permissions:\n((?:[ ]+\S.*\n)+)/m.exec(workflow)?.[1] ?? '';
    expect(
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .sort()
    ).toEqual(['contents: write', 'pull-requests: write']);
  });

  it('runs on a pull request, the daily sweep and by hand, and only a manual run can be a dry run', () => {
    expect(workflow).toMatch(/^on:\n {2}pull_request:\n {2}schedule:\n/m);
    expect(workflow).toMatch(/^ {2}workflow_dispatch:\n {4}inputs:\n {6}dry-run:\n/m);
    expect(workflow).toContain(
      "dry-run: ${{ github.event_name == 'workflow_dispatch' && inputs.dry-run || 'false' }}"
    );
  });
});
