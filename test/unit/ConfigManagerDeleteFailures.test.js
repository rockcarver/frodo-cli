import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * Decision records 0040 and 0041 for the bulk deletes of part 2a:
 * `config-manager delete custom-nodes|email-templates|endpoints|scripts|themes`
 * and `script delete -a` (with and without filters). When one delete fails, the
 * others still run, one summary names the failed one, and the command fails,
 * unless --allow-failures was given. A failure to read what there is to delete
 * fails the command whatever the flag says. Nothing to delete, when nothing was
 * named, is a success; a named item that is not there is a failure.
 *
 * Same technique as BulkDeleteFailures.test.js: the library is a deep stub and
 * every relative import of the modules under test is a set of spies, while
 * OperationRun, ErrorCause and the modules themselves stay real.
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
    this.originalErrors = Array.isArray(originalErrors)
      ? originalErrors
      : originalErrors
        ? [originalErrors]
        : [];
  }
}
const frodo = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state: deepStub(),
  FrodoError,
}));

const IDS = ['a', 'b', 'c'];
const nameOf = (id) => id;

/**
 * Every case arranges the stubs so that the items `a`, `b` and `c` exist and
 * the ones in `failing` cannot be deleted. `attempted` collects what was tried.
 * `run(module, allowFailures)` calls the function under test for all items.
 */
const CASES = [
  {
    name: 'config-manager delete custom-nodes',
    file: 'src/configManagerOps/FrConfigCustomNodesOps.ts',
    summaryName: nameOf,
    unit: 'custom node',
    arrange({ failing, attempted }) {
      frodo.authn.node.deleteCustomNodes
        .mockReset()
        .mockImplementation(async (callback) => {
          const deleted = [];
          for (const id of IDS) {
            attempted.push(id);
            if (failing.has(id)) {
              callback(
                new FrodoError(
                  `Error deleting custom node ${id}`,
                  new Error(`could not delete ${id}`)
                ),
                undefined
              );
            } else {
              callback(undefined, { displayName: id });
              deleted.push({ displayName: id });
            }
          }
          return deleted;
        });
    },
    empty: () =>
      frodo.authn.node.deleteCustomNodes.mockReset().mockResolvedValue([]),
    emptyMessage: /Deleted 0 custom nodes\./,
    failToRead: () =>
      frodo.authn.node.deleteCustomNodes
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerDeleteCustomNodes(undefined, false, allowFailures),
    fn: 'configManagerDeleteCustomNodes',
  },
  {
    name: 'config-manager delete email-templates',
    file: 'src/configManagerOps/FrConfigEmailTemplatesOps.ts',
    summaryName: nameOf,
    unit: 'email template',
    arrange({ failing, attempted }) {
      frodo.email.template.readEmailTemplates
        .mockReset()
        .mockResolvedValue(IDS.map((id) => ({ _id: `emailTemplate/${id}` })));
      frodo.email.template.deleteEmailTemplate
        .mockReset()
        .mockImplementation(async (id) => {
          attempted.push(id);
          if (failing.has(id)) throw new Error(`could not delete ${id}`);
        });
    },
    empty: () =>
      frodo.email.template.readEmailTemplates.mockReset().mockResolvedValue([]),
    emptyMessage: /No email templates found to delete\./,
    notFound: (m) => m.configManagerDeleteEmailTemplates('zzz', false, false),
    failToRead: () =>
      frodo.email.template.readEmailTemplates
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerDeleteEmailTemplates(undefined, false, allowFailures),
    fn: 'configManagerDeleteEmailTemplates',
  },
  {
    name: 'config-manager delete endpoints',
    file: 'src/configManagerOps/FrConfigEndpointsOps.ts',
    summaryName: nameOf,
    unit: 'endpoint',
    arrange({ failing, attempted }) {
      frodo.idm.config.readConfigEntitiesByType
        .mockReset()
        .mockResolvedValue(IDS.map((id) => ({ _id: `endpoint/${id}` })));
      frodo.idm.config.deleteConfigEntity
        .mockReset()
        .mockImplementation(async (id) => {
          const name = id.split('/')[1];
          attempted.push(name);
          if (failing.has(name)) throw new Error(`could not delete ${name}`);
        });
    },
    empty: () =>
      frodo.idm.config.readConfigEntitiesByType
        .mockReset()
        .mockResolvedValue([]),
    emptyMessage: /No endpoints found to delete\./,
    notFound: (m) => m.configManagerDeleteEndpoints('zzz', false, false),
    failToRead: () =>
      frodo.idm.config.readConfigEntitiesByType
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerDeleteEndpoints(undefined, false, allowFailures),
    fn: 'configManagerDeleteEndpoints',
  },
  {
    name: 'config-manager delete scripts',
    file: 'src/configManagerOps/FrConfigScriptOps.ts',
    summaryName: (id) => `${id} in realm /alpha`,
    unit: 'script',
    arrange({ failing, attempted, spy }) {
      spy('src/utils/FrConfig').realmList.mockReset().mockResolvedValue([]);
      frodo.script.readScripts.mockReset().mockResolvedValue(
        IDS.map((id) => ({
          _id: `id-${id}`,
          name: id,
          language: 'JAVASCRIPT',
          context: 'AUTHENTICATION_TREE_DECISION_NODE',
          default: false,
        }))
      );
      frodo.script.deleteScript
        .mockReset()
        .mockImplementation(async (scriptId) => {
          const name = scriptId.replace(/^id-/, '');
          attempted.push(name);
          if (failing.has(name)) throw new Error(`could not delete ${name}`);
        });
    },
    empty: () => frodo.script.readScripts.mockReset().mockResolvedValue([]),
    emptyMessage: /No scripts found to delete\./,
    notFound: (m) =>
      m.configManagerDeleteScripts([], '/alpha', 'zzz', false, false),
    failToRead: () =>
      frodo.script.readScripts
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerDeleteScripts(
        [],
        '/alpha',
        undefined,
        false,
        allowFailures
      ),
    fn: 'configManagerDeleteScripts',
  },
  {
    name: 'config-manager delete themes',
    file: 'src/configManagerOps/FrConfigThemeOps.ts',
    summaryName: (id) => `/${id}`,
    unit: 'realm',
    arrange({ failing, attempted, spy }) {
      spy('src/utils/FrConfig')
        .realmList.mockReset()
        .mockResolvedValue(IDS.map((id) => `/${id}`));
      frodo.theme.deleteThemes.mockReset().mockImplementation(async (realm) => {
        const id = realm.replace(/^\//, '');
        attempted.push(id);
        if (failing.has(id)) throw new Error(`could not delete ${id}`);
        return [{ name: `theme of ${id}` }];
      });
    },
    empty: () => frodo.theme.deleteThemes.mockReset().mockResolvedValue([]),
    emptyMessage: /No themes found to delete in realm '\/a'\./,
    failToRead: ({ spy }) =>
      spy('src/utils/FrConfig')
        .realmList.mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.configManagerDeleteThemes(undefined, undefined, false, allowFailures),
    fn: 'configManagerDeleteThemes',
  },
  {
    name: 'script delete -a',
    file: 'src/ops/ScriptOps.ts',
    summaryName: nameOf,
    unit: 'script',
    arrange({ failing, attempted, spy }) {
      spy('src/ops/utils/ScriptFilters')
        .hasScriptFilters.mockReset()
        .mockReturnValue(false);
      frodo.script.deleteScripts
        .mockReset()
        .mockImplementation(async (callback) => {
          const deleted = [];
          for (const id of IDS) {
            attempted.push(id);
            if (failing.has(id)) {
              callback(
                new FrodoError(
                  `Error deleting alpha realm script ${id}`,
                  new Error(`could not delete ${id}`)
                ),
                undefined
              );
            } else {
              callback(undefined, { name: id });
              deleted.push({ name: id });
            }
          }
          return deleted;
        });
    },
    empty: () => frodo.script.deleteScripts.mockReset().mockResolvedValue([]),
    failToRead: () =>
      frodo.script.deleteScripts
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) => m.deleteAllScripts({}, allowFailures),
    fn: 'deleteAllScripts',
  },
  {
    name: 'script delete -a --language javascript',
    file: 'src/ops/ScriptOps.ts',
    summaryName: nameOf,
    unit: 'script',
    arrange({ failing, attempted, spy }) {
      const filters = spy('src/ops/utils/ScriptFilters');
      filters.hasScriptFilters.mockReset().mockReturnValue(true);
      // the module filters what the library read; here everything matches
      filters.filterScripts
        .mockReset()
        .mockImplementation((scripts) => scripts);
      frodo.script.readScripts
        .mockReset()
        .mockResolvedValue(
          IDS.map((id) => ({ _id: `id-${id}`, name: id, default: false }))
        );
      frodo.script.deleteScript
        .mockReset()
        .mockImplementation(async (scriptId) => {
          const name = scriptId.replace(/^id-/, '');
          attempted.push(name);
          if (failing.has(name)) throw new Error(`could not delete ${name}`);
        });
    },
    empty: () => frodo.script.readScripts.mockReset().mockResolvedValue([]),
    failToRead: () =>
      frodo.script.readScripts
        .mockReset()
        .mockRejectedValue(new Error('read failed')),
    run: (m, allowFailures) =>
      m.deleteAllScripts({ language: 'javascript' }, allowFailures),
    fn: 'deleteAllScripts',
  },
];

// every relative import of the modules under test becomes spies, except the
// run tracker, the cause helper and the modules under test themselves
const modulesUnderTest = new Set(
  CASES.map((c) => path.resolve(root, c.file).replace(/\.ts$/, ''))
);
const mocked = new Map();
for (const file of new Set(CASES.map((c) => c.file))) {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8');
  const importer = path.dirname(path.resolve(root, file));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (
      modulesUnderTest.has(target) ||
      target.endsWith('/utils/OperationRun') ||
      target.endsWith('/utils/ErrorCause')
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
const spy = (file) => spies.get(path.resolve(root, file));

const modules = {};
for (const { file } of CASES) {
  modules[file] ??= await import(path.resolve(root, file));
}

// the summary is the one message of the shape "N of M <units> failed"
const SUMMARY = /^\d+ of \d+ [\w ]+ failed/;
const summaries = () =>
  printMessage.mock.calls.filter(([text]) => SUMMARY.test(String(text)));
const summary = () =>
  summaries()
    .map(([text]) => text)
    .join('\n');
const level = () => summaries()[0]?.[1];

describe.each(CASES)('$name', (c) => {
  let attempted;
  let failing;
  const ctx = () => ({ failing, attempted, spy });

  beforeEach(() => {
    jest.clearAllMocks();
    attempted = [];
    failing = new Set(['b']);
    c.arrange(ctx());
  });

  const run = (allowFailures) => c.run(modules[c.file], allowFailures);

  test('runs every delete after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual(IDS);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      new RegExp(
        `^1 of 3 ${c.unit}s failed:\\n {2}- ${c.summaryName('b').replace(/[/]/g, '\\/')}: could not delete b`
      )
    );
  });

  test('--allow-failures keeps the command successful, still printing the summary as a warning', async () => {
    expect(await run(true)).toBe(true);

    expect(attempted).toEqual(IDS);
    expect(level()).toBe('warn');
    expect(summary()).toContain(c.summaryName('b'));
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary when every delete succeeds', async () => {
    failing = new Set();
    c.arrange(ctx());

    expect(await run()).toBe(true);
    expect(attempted).toEqual(IDS);
    expect(summaries()).toHaveLength(0);
  });

  test('fails whatever --allow-failures says when it cannot read what there is to delete', async () => {
    c.failToRead(ctx());

    expect(await run(true)).toBe(false);
    expect(printError).toHaveBeenCalled();
    expect(summaries()).toHaveLength(0); // the error is shown once, no summary
  });

  if (c.empty) {
    test('nothing to delete is a success', async () => {
      c.empty(ctx());

      expect(await run()).toBe(true);
      expect(printError).not.toHaveBeenCalled();
      expect(summaries()).toHaveLength(0);
      if (c.emptyMessage) {
        expect(
          printMessage.mock.calls.map(([text]) => String(text)).join('\n')
        ).toMatch(c.emptyMessage);
      }
    });
  }

  if (c.notFound) {
    test('a named item that is not there fails the command', async () => {
      expect(await c.notFound(modules[c.file])).toBe(false);
      expect(attempted).toEqual([]);
    });
  }
});
