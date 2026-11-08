import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * Decision record 0040 for the bulk deletes whose loop is in the CLI:
 * `esv secret delete -a`, `esv variable delete -a`, `email template delete -a`,
 * `authz policy delete -a`, `authz type delete -a` and `authz set delete -a`.
 * When one delete fails, the others still run, one summary names the failed
 * one, and the command fails, unless --allow-failures was given. A failure to
 * read what there is to delete fails the command whatever the flag says.
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub and every relative import of the modules under test is a set of spies
 * (OperationRun and the modules themselves stay real).
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** A function that is a spy and, for any property read, another such function. */
function deepStub() {
  const children = new Map();
  return new Proxy(jest.fn(), {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (!children.has(prop)) children.set(prop, deepStub());
      return children.get(prop);
    },
  });
}

class FrodoError extends Error {
  constructor(message, originalErrors) {
    super(message);
    this.name = 'FrodoError';
    this.originalErrors = originalErrors;
  }
}
const frodo = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state: deepStub(),
  FrodoError,
}));

const CASES = [
  {
    name: 'esv secret delete -a',
    file: 'src/ops/cloud/SecretsOps.ts',
    fn: 'deleteSecrets',
    facade: () => frodo.cloud.secret,
    read: 'readSecrets',
    del: 'deleteSecret',
    items: ['a', 'b', 'c'].map((_id) => ({ _id })),
    idOf: (item) => item._id,
    summaryName: (id) => id,
  },
  {
    name: 'esv variable delete -a',
    file: 'src/ops/cloud/VariablesOps.ts',
    fn: 'deleteVariables',
    facade: () => frodo.cloud.variable,
    read: 'readVariables',
    del: 'deleteVariable',
    items: ['a', 'b', 'c'].map((_id) => ({ _id })),
    idOf: (item) => item._id,
    summaryName: (id) => id,
  },
  {
    name: 'email template delete -a',
    file: 'src/ops/EmailTemplateOps.ts',
    fn: 'deleteAllEmailTemplates',
    facade: () => frodo.email.template,
    read: 'readEmailTemplates',
    del: 'deleteEmailTemplate',
    items: ['a', 'b', 'c'].map((id) => ({ _id: `emailTemplate/${id}` })),
    idOf: (item) => item._id.split('/')[1],
    summaryName: (id) => id,
  },
  {
    name: 'authz policy delete -a',
    file: 'src/ops/PolicyOps.ts',
    fn: 'deletePolicies',
    facade: () => frodo.authz.policy,
    read: 'readPolicies',
    del: 'deletePolicy',
    items: ['a', 'b', 'c'].map((_id) => ({ _id })),
    idOf: (item) => item._id,
    summaryName: (id) => id,
  },
  {
    name: 'authz type delete -a',
    file: 'src/ops/ResourceTypeOps.ts',
    fn: 'deleteResourceTypes',
    facade: () => frodo.authz.resourceType,
    read: 'readResourceTypes',
    del: 'deleteResourceType',
    items: ['a', 'b', 'c'].map((uuid) => ({ uuid })),
    idOf: (item) => item.uuid,
    summaryName: (id) => id,
  },
  {
    name: 'authz set delete -a',
    file: 'src/ops/PolicySetOps.ts',
    fn: 'deletePolicySets',
    facade: () => frodo.authz.policySet,
    read: 'readPolicySets',
    del: 'deletePolicySet',
    items: ['a', 'b', 'c'].map((name) => ({ name })),
    idOf: (item) => item.name,
    summaryName: (id) => `policy set ${id}`,
  },
];

// every relative import of the modules under test becomes spies, except the
// run tracker and the modules under test themselves
const modulesUnderTest = new Set(
  CASES.map((c) => path.resolve(root, c.file).replace(/\.ts$/, ''))
);
const mocked = new Map();
for (const { file } of CASES) {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8');
  const importer = path.dirname(path.resolve(root, file));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (
      modulesUnderTest.has(target) ||
      target.endsWith('/utils/OperationRun')
    ) {
      continue;
    }
    const names = mocked.get(target) ?? new Set();
    const named = clause.match(/\{([^}]*)\}/s)?.[1] ?? '';
    for (const part of named.split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (name && !part.trim().startsWith('type ')) names.add(name);
    }
    if (/^[A-Za-z_$][\w$]*\s*(,|$)/.test(clause.trim())) names.add('default');
    mocked.set(target, names);
  }
}
// the real OperationRun prints through these
const consoleTarget = path.resolve(root, 'src/utils/Console');
mocked.set(
  consoleTarget,
  new Set([...(mocked.get(consoleTarget) ?? []), 'printError', 'printMessage'])
);
const spies = new Map();
for (const [target, names] of mocked) {
  const exports = {};
  for (const name of names) exports[name] = jest.fn();
  spies.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage } = spies.get(consoleTarget);

const modules = {};
for (const { file } of CASES) {
  modules[file] = await import(path.resolve(root, file));
}

const summary = () => printMessage.mock.calls.map(([text]) => text).join('\n');
const level = () => printMessage.mock.calls[0]?.[1];

describe.each(CASES)('$name', (c) => {
  let deleteMock;
  let readMock;
  let attempted;

  beforeEach(() => {
    jest.clearAllMocks();
    attempted = [];
    readMock = c.facade()[c.read];
    deleteMock = c.facade()[c.del];
    readMock.mockReset().mockResolvedValue(c.items);
    deleteMock.mockReset().mockImplementation(async (id) => {
      attempted.push(id);
      if (id === 'b') throw new Error('could not delete b');
    });
    if (c.fn === 'deletePolicySets') {
      frodo.authz.policy.readPoliciesByPolicySet
        .mockReset()
        .mockResolvedValue([]);
    }
  });

  const run = (allowFailures) => modules[c.file][c.fn](allowFailures);

  test('runs every delete after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual(['a', 'b', 'c']);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalled();
    expect(printMessage).toHaveBeenCalledTimes(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      new RegExp(
        `^1 of 3 \\w[\\w ]* failed:\\n {2}- ${c.summaryName('b')}: could not delete b`
      )
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(['a', 'b', 'c']);
    expect(level()).toBe('warn');
    expect(summary()).toContain(c.summaryName('b'));
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every delete succeeds', async () => {
    deleteMock.mockReset().mockResolvedValue(undefined);

    expect(await run()).toBe(true);
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read what there is to delete', async () => {
    readMock.mockReset().mockRejectedValue(new Error('read failed'));

    expect(await run(true)).toBe(false);
    expect(attempted).toEqual([]);
    expect(printError).toHaveBeenCalled();
    expect(printMessage).not.toHaveBeenCalled(); // the error is shown once, no summary
  });
});
