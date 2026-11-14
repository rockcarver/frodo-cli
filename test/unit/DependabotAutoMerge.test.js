import { describe, expect, it } from '@jest/globals';
import {
  changedLockVersions,
  decide,
  derivedUpdateType,
  ecosystemOfBranch,
  evaluate,
  isManualName,
  packageNameOfLockPath,
  parseUpdatedDependencies,
  publishTimeOf,
  registryUrl,
  REQUIRED_GROUP,
  semverBump,
} from '../../scripts/dependabot-auto-merge.mjs';

/**
 * The decision of the Dependabot auto-merge (core 0023): which pull requests may be armed. The functions are pure;
 * the registry and the repository are replaced by fakes. The commit messages are real ones of Dependabot pull
 * requests (a group of five and a single update).
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-20T00:00:00Z');
const ago = (days) => NOW - days * DAY;

const GROUP_MESSAGE = `build(deps-dev): bump the dev-minor-patch group across 1 directory with 5 updates

Bumps the dev-minor-patch group with 5 updates in the / directory:

---
updated-dependencies:
- dependency-name: axios
  dependency-version: 1.21.1
  dependency-type: direct:development
  update-type: version-update:semver-patch
  dependency-group: dev-minor-patch
- dependency-name: eslint-plugin-import-x
  dependency-version: 4.18.1
  dependency-type: direct:development
  update-type: version-update:semver-minor
  dependency-group: dev-minor-patch
- dependency-name: "@types/node"
  dependency-version: 26.1.0
  dependency-type: direct:development
  update-type: version-update:semver-minor
  dependency-group: dev-minor-patch
- dependency-name: rimraf
  dependency-version: 6.1.4
  dependency-type: direct:development
  update-type: version-update:semver-patch
  dependency-group: dev-minor-patch
- dependency-name: tsdown
  dependency-version: 0.23.7
  dependency-type: direct:development
  update-type: version-update:semver-patch
  dependency-group: dev-minor-patch
...

Signed-off-by: dependabot[bot] <support@github.com>`;

const SINGLE_MESSAGE = `Bumps [prettier](https://github.com/prettier/prettier) from 3.9.10 to 3.10.0.

---
updated-dependencies:
- dependency-name: prettier
  dependency-version: 3.10.0
  dependency-type: direct:development
  update-type: version-update:semver-minor
...

Signed-off-by: dependabot[bot] <support@github.com>`;

const AXIOS_MESSAGE = `Bumps [axios](https://github.com/axios/axios) from 1.21.0 to 1.21.1.

---
updated-dependencies:
- dependency-name: axios
  dependency-version: 1.21.1
  dependency-type: direct:development
  update-type: version-update:semver-patch
  dependency-group: tooling
...

Signed-off-by: dependabot[bot] <support@github.com>`;

const patch = (name, group) => ({
  name,
  updateType: 'version-update:semver-patch',
  group,
});

describe('isManualName: the names that stay manual', () => {
  it.each([
    'eslint',
    'ESLint',
    '@eslint/js',
    '@eslint/eslintrc',
    'eslint-plugin-import-x',
    'eslint-config-prettier',
    'typescript',
    'typescript-eslint',
    '@typescript-eslint/parser',
    '@typescript-eslint/eslint-plugin',
    'prettier',
    '@ianvs/prettier-plugin-sort-imports',
  ])('%s stays manual', (name) => {
    expect(isManualName(name)).toBe(true);
  });

  it.each([
    'axios',
    'rimraf',
    'tsdown',
    'jest',
    'ts-jest',
    '@types/node',
    '@types/jest',
    'commander',
    '@inquirer/core',
    '@modelcontextprotocol/server',
    'zod',
    'uuid',
    'colors',
    '@rockcarver/frodo-lib',
  ])('%s does not', (name) => {
    expect(isManualName(name)).toBe(false);
  });
});

describe('parseUpdatedDependencies: the block at the end of the commit message', () => {
  it('reads every entry of a group, with a quoted scoped name', () => {
    const entries = parseUpdatedDependencies(GROUP_MESSAGE);
    expect(entries.map((e) => e.name)).toEqual([
      'axios',
      'eslint-plugin-import-x',
      '@types/node',
      'rimraf',
      'tsdown',
    ]);
    expect(entries[1]).toEqual({
      name: 'eslint-plugin-import-x',
      version: '4.18.1',
      type: 'direct:development',
      updateType: 'version-update:semver-minor',
      group: 'dev-minor-patch',
    });
  });

  it('reads a single update without a group', () => {
    expect(parseUpdatedDependencies(SINGLE_MESSAGE)).toEqual([
      {
        name: 'prettier',
        version: '3.10.0',
        type: 'direct:development',
        updateType: 'version-update:semver-minor',
      },
    ]);
  });

  it('reads nothing from a message without the block, or from garbage', () => {
    expect(parseUpdatedDependencies('chore: a human commit')).toEqual([]);
    expect(parseUpdatedDependencies('')).toEqual([]);
    expect(parseUpdatedDependencies(undefined)).toEqual([]);
  });
});

describe('the lockfile', () => {
  it.each([
    ['node_modules/a', 'a'],
    ['node_modules/@s/b', '@s/b'],
    ['node_modules/a/node_modules/b', 'b'],
    ['node_modules/a/node_modules/@s/b', '@s/b'],
    ['', undefined],
    ['packages/workspace', undefined],
  ])('the name of %p is %p', (key, name) => {
    expect(packageNameOfLockPath(key)).toBe(name);
  });

  it('lists what the head adds or changes, nested and scoped, sorted by path, and nothing else', () => {
    const base = {
      packages: {
        '': { version: '1.0.0' },
        'node_modules/same': { version: '1.0.0' },
        'node_modules/changed': { version: '1.0.0' },
        'node_modules/removed': { version: '1.0.0' },
        'node_modules/a/node_modules/nested': { version: '2.0.0' },
      },
    };
    const head = {
      packages: {
        '': { version: '1.0.1' },
        'node_modules/same': { version: '1.0.0' },
        'node_modules/changed': { version: '1.0.1' },
        'node_modules/added': { version: '3.0.0' },
        'node_modules/@s/scoped': { version: '4.0.0' },
        'node_modules/a/node_modules/nested': { version: '2.0.1' },
        'node_modules/workspace': { link: true },
        'node_modules/noversion': {},
      },
    };
    expect(
      changedLockVersions(base, head).map((c) => `${c.name}@${c.version}`)
    ).toEqual([
      '@s/scoped@4.0.0',
      'nested@2.0.1',
      'added@3.0.0',
      'changed@1.0.1',
    ]);
  });

  it('copes with an empty or missing lockfile', () => {
    expect(changedLockVersions(undefined, undefined)).toEqual([]);
    expect(
      changedLockVersions(
        {},
        { packages: { 'node_modules/a': { version: '1.0.0' } } }
      )
    ).toHaveLength(1);
  });
});

describe('the registry', () => {
  it('encodes the slash of a scoped name', () => {
    expect(registryUrl('axios')).toBe('https://registry.npmjs.org/axios');
    expect(registryUrl('@types/node')).toBe(
      'https://registry.npmjs.org/@types%2fnode'
    );
  });

  it('reads a publish time, and nothing for what is unknown or unparsable', () => {
    const doc = {
      time: { '1.0.0': '2026-11-01T00:00:00.000Z', '1.0.1': 'yesterday' },
    };
    expect(publishTimeOf(doc, '1.0.0')).toBe(
      Date.parse('2026-11-01T00:00:00Z')
    );
    expect(publishTimeOf(doc, '1.0.1')).toBeUndefined();
    expect(publishTimeOf(doc, '9.9.9')).toBeUndefined();
    expect(publishTimeOf(undefined, '1.0.0')).toBeUndefined();
  });

  it('knows the ecosystem from the branch', () => {
    expect(
      ecosystemOfBranch('dependabot/npm_and_yarn/dev-minor-patch-abc')
    ).toBe('npm_and_yarn');
    expect(
      ecosystemOfBranch('dependabot/github_actions/actions/checkout-8')
    ).toBe('github_actions');
    expect(ecosystemOfBranch('feature/x')).toBe('unknown');
  });
});

describe('the update type that a security update lacks', () => {
  it.each([
    ['1.2.3', '1.2.4', 'patch'],
    ['1.2.3', '1.3.0', 'minor'],
    ['1.2.3', '2.0.0', 'major'],
    ['1.2.3', '1.2.3', 'unknown'],
    ['1.2.3', '1.2.4-beta.1', 'unknown'],
    ['5.0.0-43', '5.0.0-44', 'unknown'],
    [undefined, '1.0.0', 'unknown'],
  ])('%s to %s is %s', (from, to, bump) => {
    expect(semverBump(from, to)).toBe(bump);
  });

  it('takes the widest change of the entries of that name', () => {
    const changed = [
      { name: 'hono', version: '4.13.18', from: '4.13.13' },
      { name: 'hono', version: '4.14.0', from: '4.13.13' },
      { name: 'other', version: '2.0.0', from: '1.0.0' },
    ];
    expect(derivedUpdateType('hono', changed)).toBe(
      'version-update:semver-minor'
    );
    expect(derivedUpdateType('other', changed)).toBe(
      'version-update:semver-major'
    );
    expect(derivedUpdateType('missing', changed)).toBeUndefined();
    expect(
      derivedUpdateType('hono', [{ name: 'hono', version: '1.0.0' }])
    ).toBeUndefined();
    expect(derivedUpdateType('hono', undefined)).toBeUndefined();
  });
});

describe('decide', () => {
  const ok = {
    updates: [patch('axios', 'tooling'), patch('rimraf', 'tooling')],
    ecosystem: 'npm_and_yarn',
    changed: [
      { path: 'node_modules/axios', name: 'axios', version: '1.21.1' },
      {
        path: 'node_modules/rimraf/node_modules/glob',
        name: 'glob',
        version: '14.0.5',
      },
    ],
    times: { 'axios@1.21.1': ago(10), 'glob@14.0.5': ago(9) },
    now: NOW,
  };

  it('arms a patch update whose every version is old enough', () => {
    expect(decide(ok)).toEqual({ armed: true, reasons: [] });
  });

  it('refuses a transitive version that is too young, and names it', () => {
    const v = decide({
      ...ok,
      times: { ...ok.times, 'glob@14.0.5': ago(3.2) },
    });
    expect(v.armed).toBe(false);
    expect(v.reasons).toEqual([
      'glob@14.0.5 was published 3.2 days ago, less than 7',
    ]);
  });

  it('accepts exactly 7 days and refuses a little less', () => {
    expect(
      decide({ ...ok, times: { ...ok.times, 'glob@14.0.5': ago(7) } }).armed
    ).toBe(true);
    expect(
      decide({ ...ok, times: { ...ok.times, 'glob@14.0.5': ago(7) + 1 } }).armed
    ).toBe(false);
  });

  it('honours another minimum age', () => {
    expect(
      decide({
        ...ok,
        times: { ...ok.times, 'glob@14.0.5': ago(3) },
        minAgeDays: 2,
      }).armed
    ).toBe(true);
  });

  it('refuses when a publish time is missing or the registry could not be read', () => {
    expect(
      decide({ ...ok, times: { 'axios@1.21.1': ago(10) } }).reasons
    ).toEqual(['glob@14.0.5: no publish time']);
    const failed = decide({
      ...ok,
      times: { 'axios@1.21.1': ago(10) },
      errors: { 'glob@14.0.5': 'HTTP 503' },
    });
    expect(failed.armed).toBe(false);
    expect(failed.reasons[0]).toContain(
      'the registry could not be read (HTTP 503)'
    );
  });

  it('refuses a major update, an unknown update type and a name that stays manual', () => {
    const major = decide({
      ...ok,
      updates: [{ name: 'axios', updateType: 'version-update:semver-major' }],
    });
    expect(major.armed).toBe(false);
    const unknown = decide({ ...ok, updates: [{ name: 'axios' }] });
    expect(unknown.reasons[0]).toContain('unknown');
    const manual = decide({
      ...ok,
      updates: [
        patch('axios', 'tooling'),
        patch('eslint-plugin-import-x', 'tooling'),
      ],
    });
    expect(manual.reasons).toEqual([
      'eslint-plugin-import-x stays manual (eslint, prettier or typescript)',
    ]);
  });

  it('refuses without a metadata block, without a lockfile difference or with an unreadable one', () => {
    expect(decide({ ...ok, updates: [] }).armed).toBe(false);
    expect(decide({ ...ok, changed: [] }).reasons).toEqual([
      'the lockfile difference is empty',
    ]);
    expect(decide({ ...ok, changed: undefined }).reasons).toEqual([
      'the lockfile difference could not be read',
    ]);
  });

  it('does not look at a lockfile for a GitHub Actions update, which is not in the group either', () => {
    const input = {
      updates: [patch('actions/checkout', undefined)],
      ecosystem: 'github_actions',
      now: NOW,
      times: {},
    };
    expect(decide({ ...input, requiredGroup: null })).toEqual({
      armed: true,
      reasons: [],
    });
    expect(decide(input).reasons).toEqual([
      'actions/checkout is not in the group tooling (no group)',
    ]);
  });

  it('is limited to the tooling group by default, and a pull request of another group is refused', () => {
    expect(REQUIRED_GROUP).toBe('tooling');
    const other = { ...ok, updates: [patch('axios', 'dev-minor-patch')] };
    expect(decide(other).reasons).toEqual([
      'axios is not in the group tooling (dev-minor-patch)',
    ]);
    expect(decide({ ...other, requiredGroup: null }).armed).toBe(true);
    expect(decide({ ...other, requiredGroup: 'dev-minor-patch' }).armed).toBe(
      true
    );
    expect(decide({ ...ok, updates: [patch('axios', undefined)] }).armed).toBe(
      false
    );
  });
});

describe('evaluate: a pull request, with the repository and the registry replaced', () => {
  const LOCK_BASE = JSON.stringify({
    packages: {
      '': {},
      'node_modules/axios': { version: '1.21.0' },
      'node_modules/glob': { version: '13.0.0' },
    },
  });
  const LOCK_HEAD = JSON.stringify({
    packages: {
      '': {},
      'node_modules/axios': { version: '1.21.1' },
      'node_modules/glob': { version: '14.0.5' },
    },
  });

  const makeGh = ({
    pr = {},
    message = GROUP_MESSAGE,
    head = LOCK_HEAD,
  } = {}) => {
    const calls = [];
    const gh = (args) => {
      calls.push(args);
      const path = args.find((a) => a.startsWith('repos/'));
      if (path === 'repos/o/r/pulls/5') {
        return JSON.stringify({
          state: 'open',
          user: { login: 'dependabot[bot]' },
          head: {
            ref: 'dependabot/npm_and_yarn/dev-minor-patch-abc',
            sha: 'headsha',
          },
          base: { sha: 'basesha' },
          auto_merge: null,
          ...pr,
        });
      }
      if (path === 'repos/o/r/pulls/5/commits')
        return JSON.stringify([
          [{ commit: { message: 'first' } }, { commit: { message } }],
        ]);
      if (path.startsWith('repos/o/r/compare/')) return 'mergebase\n';
      if (path === 'repos/o/r/contents/package-lock.json?ref=mergebase')
        return LOCK_BASE;
      if (path === 'repos/o/r/contents/package-lock.json?ref=headsha')
        return head;
      throw new Error(`unexpected gh call ${args.join(' ')}`);
    };
    return { gh, calls };
  };

  const registry = (days) => async (url) => {
    const name = decodeURIComponent(url.split('registry.npmjs.org/')[1]);
    const versions = { axios: '1.21.1', glob: '14.0.5' };
    return {
      time: {
        [versions[name]]: new Date(NOW - days[name] * DAY).toISOString(),
      },
    };
  };

  it('arms a pull request whose versions are all old', async () => {
    const message = AXIOS_MESSAGE;
    const { gh } = makeGh({ message });
    const v = await evaluate({
      repo: 'o/r',
      number: 5,
      gh,
      fetchJson: registry({ axios: 10, glob: 9 }),
      now: NOW,
    });
    expect(v).toMatchObject({
      armed: true,
      reasons: [],
      checked: 2,
      alreadyArmed: false,
    });
  });

  it('refuses when one transitive version is young, and reads each registry document once', async () => {
    const message = AXIOS_MESSAGE;
    const { gh } = makeGh({ message });
    const seen = [];
    const fetchJson = async (url) => {
      seen.push(url);
      return registry({ axios: 10, glob: 3 })(url);
    };
    const v = await evaluate({
      repo: 'o/r',
      number: 5,
      gh,
      fetchJson,
      now: NOW,
    });
    expect(v.armed).toBe(false);
    expect(v.reasons).toEqual([
      'glob@14.0.5 was published 3.0 days ago, less than 7',
    ]);
    expect(seen).toHaveLength(2);
  });

  it('refuses when the registry cannot be read', async () => {
    const message = AXIOS_MESSAGE;
    const { gh } = makeGh({ message });
    const v = await evaluate({
      repo: 'o/r',
      number: 5,
      gh,
      fetchJson: async () => {
        throw new Error('HTTP 503');
      },
      now: NOW,
    });
    expect(v.armed).toBe(false);
    expect(v.reasons.some((r) => r.includes('HTTP 503'))).toBe(true);
  });

  it('refuses a pull request that is not from Dependabot, or not open, although everything else would pass', async () => {
    const opts = {
      repo: 'o/r',
      number: 5,
      fetchJson: registry({ axios: 10, glob: 9 }),
      now: NOW,
    };
    const clean = await evaluate({
      ...opts,
      gh: makeGh({ message: AXIOS_MESSAGE }).gh,
    });
    expect(clean.armed).toBe(true);
    const human = makeGh({
      message: AXIOS_MESSAGE,
      pr: { user: { login: 'someone' } },
    });
    expect(await evaluate({ ...opts, gh: human.gh })).toMatchObject({
      armed: false,
      reasons: ['the pull request is not from Dependabot'],
    });
    const closed = makeGh({ message: AXIOS_MESSAGE, pr: { state: 'closed' } });
    expect(await evaluate({ ...opts, gh: closed.gh })).toMatchObject({
      armed: false,
      reasons: ['the pull request is not open'],
    });
    expect(
      (await evaluate({ ...opts, gh: closed.gh, ignoreState: true })).armed
    ).toBe(true);
  });

  it('refuses the real group, which holds a name that stays manual, and reports an armed one as already armed', async () => {
    const group = makeGh();
    const v = await evaluate({
      repo: 'o/r',
      number: 5,
      gh: group.gh,
      fetchJson: registry({ axios: 10, glob: 9 }),
      now: NOW,
    });
    expect(v.armed).toBe(false);
    expect(v.reasons).toContain(
      'eslint-plugin-import-x stays manual (eslint, prettier or typescript)'
    );
    expect(v.reasons).toContain(
      'axios is not in the group tooling (dev-minor-patch)'
    );
    const armed = makeGh({
      message: AXIOS_MESSAGE,
      pr: { auto_merge: { merge_method: 'squash' } },
    });
    const w = await evaluate({
      repo: 'o/r',
      number: 5,
      gh: armed.gh,
      fetchJson: registry({ axios: 10, glob: 9 }),
      now: NOW,
    });
    expect(w).toMatchObject({ armed: true, alreadyArmed: true });
  });

  it('derives the update type of a security update from the lockfile; with no group it is for a person, and a young version is named too', async () => {
    const security = `Bumps [axios](https://github.com/axios/axios) from 1.21.0 to 1.21.1.

---
updated-dependencies:
- dependency-name: axios
  dependency-version: 1.21.1
  dependency-type: indirect
...

Signed-off-by: dependabot[bot] <support@github.com>`;
    const { gh } = makeGh({ message: security });
    const opts = { repo: 'o/r', number: 5, gh, now: NOW };
    const old = await evaluate({
      ...opts,
      fetchJson: registry({ axios: 10, glob: 9 }),
      requiredGroup: null,
    });
    expect(old).toMatchObject({ armed: true, reasons: [] });
    const grouped = await evaluate({
      ...opts,
      fetchJson: registry({ axios: 10, glob: 9 }),
    });
    expect(grouped.reasons).toEqual([
      'axios is not in the group tooling (no group)',
    ]);
    const young = await evaluate({
      ...opts,
      fetchJson: registry({ axios: 2, glob: 9 }),
      requiredGroup: null,
    });
    expect(young.armed).toBe(false);
    expect(young.reasons).toEqual([
      'axios@1.21.1 was published 2.0 days ago, less than 7',
    ]);
  });

  it('refuses a security update that is a major bump of the lockfile', async () => {
    const security = AXIOS_MESSAGE.replace(
      'update-type: version-update:semver-patch\n',
      ''
    );
    const major = JSON.stringify({
      packages: {
        '': {},
        'node_modules/axios': { version: '2.0.0' },
        'node_modules/glob': { version: '14.0.5' },
      },
    });
    const { gh } = makeGh({ message: security, head: major });
    const v = await evaluate({
      repo: 'o/r',
      number: 5,
      gh,
      fetchJson: registry({ axios: 10, glob: 9 }),
      now: NOW,
    });
    expect(v.armed).toBe(false);
    expect(v.reasons[0]).toContain(
      'axios is not a patch or minor update (version-update:semver-major)'
    );
  });

  it('refuses when the lockfile cannot be read', async () => {
    const { gh } = makeGh({ message: AXIOS_MESSAGE, head: 'not json' });
    const v = await evaluate({
      repo: 'o/r',
      number: 5,
      gh,
      fetchJson: registry({ axios: 10, glob: 9 }),
      now: NOW,
    });
    expect(v.reasons).toEqual(['the lockfile difference could not be read']);
  });
});
