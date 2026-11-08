import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * Decision records 0040 and 0041 for `config-manager pull` and `config-manager
 * push` of `secrets`, `service-objects`, `themes`, `custom-nodes` and
 * `endpoints`. When one item fails, the others still run, one summary names the
 * failed one, and the command fails, unless --allow-failures was given. What
 * the command line names (the kind to push, a name, the file) must be there and
 * can be read, whatever the flag says. Nothing to do is a success.
 *
 * Same technique as ConfigManagerDeleteFailures.test.js: the library is a deep
 * stub and every relative import of the modules under test is a set of spies,
 * while OperationRun, ErrorCause and the modules themselves stay real. The
 * files the push commands read and the pull commands write are real, in a
 * temporary folder that the stubs of `getFilePath` and `getWorkingDirectory`
 * point to.
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
const state = deepStub();
// read when the modules under test are loaded
frodo.utils.constants.DEFAULT_REALM_KEY = '__default__realm__';
frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY = 'cloud';
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state,
  FrodoError,
}));

const IDS = ['a', 'b', 'c'];
const nameOf = (id) => id;

let tmp;
/** Writes a file (JSON unless it is text) below the temporary folder. */
function write(relative, content) {
  const file = path.join(tmp, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content)
  );
}
const remove = (relative) =>
  fs.rmSync(path.join(tmp, relative), { recursive: true, force: true });
const exists = (relative) => fs.existsSync(path.join(tmp, relative));

/**
 * Every case arranges the stubs and the files so that the items `a`, `b` and
 * `c` exist and the ones in `failing` fail. `attempted` collects what was
 * tried. `run(module, allowFailures, ctx)` calls the function under test for
 * all items. `reason(id)` is what the summary says about a failed item, `shown`
 * what is printed about it besides the summary. `outputs(id)` is the file a
 * successful pull writes. `readFailure` breaks what the command reads first,
 * and `empty` leaves nothing to do.
 */
const CASES = [
  {
    name: 'config-manager pull secrets',
    file: 'src/configManagerOps/FrConfigSecretOps.ts',
    unit: 'secret',
    summaryName: nameOf,
    reason: (id) => `could not read the versions of ${id}`,
    arrange({ failing, attempted }) {
      frodo.cloud.secret.readSecrets.mockReset().mockResolvedValue(
        IDS.map((id) => ({
          _id: id,
          description: 'd',
          encoding: 'generic',
          useInPlaceholders: true,
        }))
      );
      frodo.cloud.secret.readVersionsOfSecret
        .mockReset()
        .mockImplementation(async (id) => {
          attempted.push(id);
          if (failing.has(id)) {
            throw new Error(`could not read the versions of ${id}`);
          }
          return [{ status: 'ENABLED' }];
        });
    },
    outputs: (id) => `esvs/secrets/${id}.json`,
    run: (m, allowFailures) =>
      m.configManagerExportSecrets(false, false, allowFailures),
    readFailure: {
      arrange: () =>
        frodo.cloud.secret.readSecrets
          .mockReset()
          .mockRejectedValue(new Error('read failed')),
      text: /read failed/,
    },
    empty: () =>
      frodo.cloud.secret.readSecrets.mockReset().mockResolvedValue([]),
  },
  {
    name: 'config-manager push secrets',
    file: 'src/configManagerOps/FrConfigSecretOps.ts',
    unit: 'secret',
    summaryName: nameOf,
    reason: (id) => `could not create ${id}`,
    arrange({ failing, attempted }) {
      for (const id of IDS) {
        write(`esvs/secrets/${id}.json`, {
          _id: id,
          description: 'd',
          encoding: 'generic',
          useInPlaceholders: true,
          valueBase64: 'dmFsdWU=',
        });
      }
      frodo.cloud.secret.readSecrets.mockReset().mockResolvedValue([]);
      frodo.cloud.secret.createSecret
        .mockReset()
        .mockImplementation(async (id) => {
          attempted.push(id);
          if (failing.has(id)) throw new Error(`could not create ${id}`);
          return { activeVersion: '1' };
        });
    },
    run: (m, allowFailures) =>
      m.configManagerImportSecrets(undefined, false, allowFailures),
    readFailure: {
      arrange: () => remove('esvs'),
      text: /No secrets to import: the folder '.*esvs\/secrets\/' does not exist/,
    },
    empty: () => IDS.forEach((id) => remove(`esvs/secrets/${id}.json`)),
    emptyMessage: /No secrets found to import/,
    extras: [
      {
        name: 'a secret file that cannot be parsed is a failure of that secret, the others are imported',
        async test(m, { attempted }) {
          write('esvs/secrets/b.json', '{ not json');

          expect(await m.configManagerImportSecrets(undefined, false)).toBe(
            false
          );

          expect(attempted).toEqual(['a', 'c']);
          expect(summary()).toMatch(/^1 of 3 secrets failed:\n {2}- b: /);
        },
      },
      {
        name: 'a named secret without a file fails the command whatever --allow-failures says',
        async test(m, { attempted }) {
          expect(await m.configManagerImportSecrets('zzz', false, true)).toBe(
            false
          );

          expect(attempted).toEqual([]);
          expect(consoleText()).toMatch(/No matching secret found for zzz/);
          expect(summaries()).toHaveLength(0);
        },
      },
    ],
  },
  {
    name: 'config-manager pull service-objects',
    file: 'src/configManagerOps/FrConfigServiceObjectsOps.ts',
    unit: 'service object',
    summaryName: (id) => `alpha_user - ${id}`,
    reason: (id) => `could not search ${id}`,
    arrange: arrangeServiceObjectsExport((id) => {
      throw new Error(`could not search ${id}`);
    }),
    outputs: (id) => `service-objects/alpha_user/${id}.json`,
    run: (m, allowFailures, { tmpFile }) =>
      m.configManagerExportServiceObjectsFromFile(tmpFile, allowFailures),
    readFailure: {
      arrange: () => remove('service-objects.json'),
      text: /Error reading file .*service-objects\.json/,
    },
    extras: [
      {
        name: 'a nothing-found search result is a failure of that object, the others are still exported',
        async test(m, { attempted, tmpFile }) {
          frodo.idm.managed.queryManagedObjects
            .mockReset()
            .mockImplementation(async (type, filter) => {
              const id = /"(.*)"/.exec(filter)[1];
              attempted.push(id);
              return id === 'b' ? [] : [{ _id: id }];
            });

          expect(
            await m.configManagerExportServiceObjectsFromFile(tmpFile, false)
          ).toBe(false);

          expect(attempted).toEqual(IDS);
          expect(exists('service-objects/alpha_user/a.json')).toBe(true);
          expect(exists('service-objects/alpha_user/b.json')).toBe(false);
          expect(exists('service-objects/alpha_user/c.json')).toBe(true);
          expect(consoleText()).toMatch(
            /Unexpected result from search: 0 entries found for alpha_user - b/
          );
          expect(summary()).toMatch(
            /^1 of 3 service objects failed:\n {2}- alpha_user - b: 0 entries found, expected 1/
          );
        },
      },
    ],
  },
  {
    name: 'config-manager push service-objects',
    file: 'src/configManagerOps/FrConfigServiceObjectsOps.ts',
    unit: 'service object',
    summaryName: (id) => `alpha_user/${id}.json`,
    reason: (id) => `could not update ${id}`,
    arrange({ failing, attempted }) {
      for (const id of IDS) {
        write(`service-objects/alpha_user/${id}.json`, {
          _id: id,
          _rev: '1',
          userName: id,
        });
      }
      frodo.idm.managed.updateManagedObject
        .mockReset()
        .mockImplementation(async (type, id) => {
          attempted.push(id);
          if (failing.has(id)) throw new Error(`could not update ${id}`);
        });
    },
    run: (m, allowFailures) =>
      m.configManagerImportServiceObjects(allowFailures),
    readFailure: {
      arrange: () => remove('service-objects'),
      text: /No service objects to import: the folder '.*service-objects\/' does not exist/,
    },
    empty: () => remove('service-objects/alpha_user'),
    extras: [
      {
        name: 'a service object file that cannot be parsed is a failure of that file, the others are imported',
        async test(m, { attempted }) {
          write('service-objects/alpha_user/b.json', '{ not json');

          expect(await m.configManagerImportServiceObjects(false)).toBe(false);

          expect(attempted).toEqual(['a', 'c']);
          expect(summary()).toMatch(
            /^1 of 3 service objects failed:\n {2}- alpha_user\/b\.json: /
          );
        },
      },
    ],
  },
  {
    name: 'config-manager pull themes',
    file: 'src/configManagerOps/FrConfigThemeOps.ts',
    unit: 'realm',
    summaryName: nameOf,
    reason: (id) => `could not read the themes of ${id}`,
    arrange({ failing, attempted, spy }) {
      let current;
      state.setRealm.mockReset().mockImplementation((realm) => {
        current = realm;
      });
      spy('src/utils/FrConfig').realmList.mockReset().mockResolvedValue(IDS);
      frodo.theme.readThemes.mockReset().mockImplementation(async () => {
        attempted.push(current);
        if (failing.has(current)) {
          throw new Error(`could not read the themes of ${current}`);
        }
        return [{ _id: `t-${current}`, name: `theme-${current}` }];
      });
    },
    outputs: (id) => `realms/${id}/themes/theme-${id}/theme-${id}.json`,
    run: (m, allowFailures) =>
      m.configManagerExportThemes(undefined, allowFailures),
    readFailure: {
      arrange: ({ spy }) =>
        spy('src/utils/FrConfig')
          .realmList.mockReset()
          .mockRejectedValue(new Error('read failed')),
      text: /read failed/,
    },
    empty: ({ spy }) =>
      spy('src/utils/FrConfig').realmList.mockReset().mockResolvedValue([]),
  },
  {
    name: 'config-manager push themes',
    file: 'src/configManagerOps/FrConfigThemeOps.ts',
    unit: 'realm',
    summaryName: nameOf,
    reason: (id) => `could not import the themes of ${id}`,
    arrange({ failing, attempted }) {
      let current;
      for (const id of IDS) {
        write(`realms/${id}/themes/theme-${id}/theme-${id}.json`, {
          _id: `t-${id}`,
          name: `theme-${id}`,
        });
      }
      state.setRealm.mockReset().mockImplementation((realm) => {
        current = realm;
      });
      frodo.theme.importThemes.mockReset().mockImplementation(async (data) => {
        attempted.push(current);
        if (failing.has(current)) {
          throw new Error(`could not import the themes of ${current}`);
        }
        return Object.values(data.theme);
      });
    },
    run: (m, allowFailures) =>
      m.configManagerImportThemes(undefined, allowFailures),
    readFailure: {
      arrange: () => remove('realms'),
      text: /No themes to import: the folder '.*realms' does not exist/,
    },
    empty: () => IDS.forEach((id) => remove(`realms/${id}`)),
    extras: [
      {
        name: 'a realm without a themes folder is skipped with a warning when all realms are imported',
        async test(m, { attempted }) {
          remove('realms/b/themes');

          expect(await m.configManagerImportThemes(undefined, false)).toBe(
            true
          );

          expect(attempted).toEqual(['a', 'c']);
          expect(printMessage).toHaveBeenCalledWith(
            "Skipping realm 'b': it has no themes folder.",
            'warn'
          );
          expect(summaries()).toHaveLength(0);
        },
      },
      {
        name: 'a named realm without a themes folder fails the command whatever --allow-failures says',
        async test(m, { attempted }) {
          expect(await m.configManagerImportThemes('zzz', true)).toBe(false);

          expect(attempted).toEqual([]);
          expect(consoleText()).toMatch(
            /No themes to import: the folder '.*realms\/zzz\/themes' does not exist/
          );
          expect(summaries()).toHaveLength(0);
        },
      },
      {
        name: 'a theme file that cannot be parsed fails the realm of that theme, the other realms are imported',
        async test(m, { attempted }) {
          write('realms/b/themes/theme-b/theme-b.json', '{ not json');

          expect(await m.configManagerImportThemes(undefined, false)).toBe(
            false
          );

          expect(attempted).toEqual(['a', 'c']);
          expect(summary()).toMatch(/^1 of 3 realms failed:\n {2}- b: /);
        },
      },
    ],
  },
  {
    name: 'config-manager pull custom-nodes',
    file: 'src/configManagerOps/FrConfigCustomNodesOps.ts',
    unit: 'custom node',
    summaryName: nameOf,
    reason: (id) => `could not write the script of ${id}`,
    arrange({ failing, attempted }) {
      frodo.authn.node.readCustomNodes.mockReset().mockResolvedValue(
        IDS.map((id) => ({
          _id: `${id}-1`,
          displayName: id,
          script: 'return;',
        }))
      );
      frodo.utils.saveTextToFile
        .mockReset()
        .mockImplementation((text, file) => {
          const id = path.basename(file, '.js');
          attempted.push(id);
          if (failing.has(id)) {
            throw new Error(`could not write the script of ${id}`);
          }
          fs.writeFileSync(file, text);
        });
    },
    outputs: (id) => `custom-nodes/nodes/${id}/${id}.json`,
    run: (m, allowFailures) =>
      m.configManagerExportCustomNodes(undefined, allowFailures),
    readFailure: {
      arrange: () =>
        frodo.authn.node.readCustomNodes
          .mockReset()
          .mockRejectedValue(new Error('read failed')),
      text: /read failed/,
    },
    empty: () =>
      frodo.authn.node.readCustomNodes.mockReset().mockResolvedValue([]),
    extras: [
      {
        name: 'a named custom node that does not exist fails the command whatever --allow-failures says',
        async test(m) {
          frodo.authn.node.readCustomNode
            .mockReset()
            .mockRejectedValue(new Error('Custom node zzz not found'));

          expect(await m.configManagerExportCustomNodes('zzz', true)).toBe(
            false
          );

          expect(consoleText()).toMatch(/Custom node zzz not found/);
          expect(summaries()).toHaveLength(0);
        },
      },
    ],
  },
  {
    name: 'config-manager push custom-nodes',
    file: 'src/configManagerOps/FrConfigCustomNodesOps.ts',
    unit: 'custom node',
    summaryName: nameOf,
    reason: (id) => `could not import ${id}`,
    arrange({ failing, attempted }) {
      for (const id of IDS) {
        write(`custom-nodes/nodes/${id}/${id}.json`, {
          _id: `${id}-1`,
          displayName: id,
          script: { file: `${id}.js` },
        });
        write(`custom-nodes/nodes/${id}/${id}.js`, 'return;');
      }
      // as the library does: every custom node goes to the callback, and the
      // error of a failed one is the raw request error, which names no node
      frodo.authn.node.importCustomNodes
        .mockReset()
        .mockImplementation(
          async (nodeId, nodeName, data, options, callback) => {
            const imported = [];
            for (const node of Object.values(data.nodeTypes)) {
              attempted.push(node.displayName);
              if (failing.has(node.displayName)) {
                callback(
                  Object.assign(
                    new Error(`could not import ${node.displayName}`),
                    {
                      config: {
                        url: 'https://tenant.example.com/am/json/nodes',
                      },
                    }
                  ),
                  undefined
                );
              } else {
                callback(undefined, node);
                imported.push(node);
              }
            }
            return imported;
          }
        );
    },
    run: (m, allowFailures) =>
      m.configManagerImportCustomNodes(undefined, undefined, allowFailures),
    readFailure: {
      arrange: () => remove('custom-nodes'),
      text: /No custom nodes to import: the folder '.*custom-nodes\/nodes' does not exist/,
    },
    empty: () => IDS.forEach((id) => remove(`custom-nodes/nodes/${id}`)),
    extras: [
      {
        name: 'a named custom node that is not in the folder fails the command whatever --allow-failures says',
        async test(m, { attempted }) {
          expect(
            await m.configManagerImportCustomNodes('zzz', undefined, true)
          ).toBe(false);

          expect(attempted).toEqual([]);
          expect(consoleText()).toMatch(/Custom node not found: zzz/);
        },
      },
      {
        name: 'a custom node folder that cannot be parsed is a failure of that folder, the others are imported',
        async test(m, { attempted }) {
          write('custom-nodes/nodes/b/b.json', '{ not json');

          expect(
            await m.configManagerImportCustomNodes(undefined, undefined, false)
          ).toBe(false);

          expect(attempted).toEqual(['a', 'c']);
          expect(summary()).toMatch(/^1 of 3 custom nodes failed:\n {2}- b: /);
        },
      },
      {
        name: 'imports only the named custom node',
        async test(m, { attempted }) {
          expect(await m.configManagerImportCustomNodes('c')).toBe(true);

          expect(attempted).toEqual(['c']);
        },
      },
    ],
  },
  {
    name: 'config-manager pull endpoints',
    file: 'src/configManagerOps/FrConfigEndpointsOps.ts',
    unit: 'endpoint',
    summaryName: nameOf,
    reason: (id) => `could not extract the script of ${id}`,
    arrange({ failing, attempted, spy }) {
      frodo.idm.config.readConfigEntitiesByType.mockReset().mockResolvedValue(
        IDS.map((id) => ({
          _id: `endpoint/${id}`,
          source: 'return;',
          type: 'javascript',
        }))
      );
      spy('src/utils/Config')
        .extractFrConfigDataToFile.mockReset()
        .mockImplementation((source, filename, dir) => {
          const id = dir.split('/')[1];
          attempted.push(id);
          if (failing.has(id)) {
            throw new Error(`could not extract the script of ${id}`);
          }
        });
    },
    outputs: (id) => `endpoints/${id}/${id}.json`,
    run: (m, allowFailures) =>
      m.configManagerExportEndpoints(undefined, allowFailures),
    readFailure: {
      arrange: () =>
        frodo.idm.config.readConfigEntitiesByType
          .mockReset()
          .mockRejectedValue(new Error('read failed')),
      text: /read failed/,
    },
    empty: () =>
      frodo.idm.config.readConfigEntitiesByType
        .mockReset()
        .mockResolvedValue([]),
    extras: [
      {
        name: 'a named endpoint that does not exist fails the command whatever --allow-failures says',
        async test(m, { attempted }) {
          expect(await m.configManagerExportEndpoints('zzz', true)).toBe(false);

          expect(attempted).toEqual([]);
          expect(consoleText()).toMatch(/Endpoint 'zzz' not found\./);
          expect(summaries()).toHaveLength(0);
        },
      },
      {
        name: 'exports only the named endpoint',
        async test(m, { attempted }) {
          expect(await m.configManagerExportEndpoints('c')).toBe(true);

          expect(attempted).toEqual(['c']);
        },
      },
    ],
  },
  {
    name: 'config-manager push endpoints',
    file: 'src/configManagerOps/FrConfigEndpointsOps.ts',
    unit: 'endpoint',
    summaryName: nameOf,
    reason: (id) => `could not import ${id}`,
    arrange({ failing, attempted }) {
      for (const id of IDS) {
        write(`endpoints/${id}/${id}.json`, {
          _id: `endpoint/${id}`,
          file: `${id}.js`,
          type: 'javascript',
        });
        write(`endpoints/${id}/${id}.js`, 'return;');
      }
      frodo.idm.config.importConfigEntities
        .mockReset()
        .mockImplementation(async (data, entityId, options, callback) => {
          for (const [id, entity] of Object.entries(data.idm)) {
            const name = id.split('/')[1];
            attempted.push(name);
            if (failing.has(name)) {
              callback(new Error(`could not import ${name}`), undefined);
            } else {
              callback(undefined, entity);
            }
          }
          return [];
        });
    },
    run: (m, allowFailures) =>
      m.configManagerImportEndpoints(undefined, undefined, allowFailures),
    readFailure: {
      arrange: () => remove('endpoints'),
      text: /No endpoints to import: the folder '.*endpoints' does not exist/,
    },
    empty: () => IDS.forEach((id) => remove(`endpoints/${id}`)),
    extras: [
      {
        name: 'a named endpoint that is not in the folder fails the command whatever --allow-failures says',
        async test(m, { attempted }) {
          expect(
            await m.configManagerImportEndpoints('zzz', undefined, true)
          ).toBe(false);

          expect(attempted).toEqual([]);
          expect(consoleText()).toMatch(/Endpoint 'zzz' not found\./);
        },
      },
      {
        name: 'an endpoint folder that cannot be parsed is a failure of that folder, the others are imported',
        async test(m, { attempted }) {
          write('endpoints/b/b.json', '{ not json');

          expect(
            await m.configManagerImportEndpoints(undefined, undefined, false)
          ).toBe(false);

          expect(attempted).toEqual(['a', 'c']);
          expect(summary()).toMatch(/^1 of 3 endpoints failed:\n {2}- b: /);
        },
      },
      {
        name: 'imports only the named endpoint',
        async test(m, { attempted }) {
          expect(await m.configManagerImportEndpoints('c')).toBe(true);

          expect(attempted).toEqual(['c']);
        },
      },
    ],
  },
];

/** The arrange of the service objects export; `onFailing(id)` throws or answers for the failing id. */
function arrangeServiceObjectsExport(onFailing) {
  return ({ failing, attempted }) => {
    write('service-objects.json', {
      alpha_user: IDS.map((id) => ({
        searchField: 'userName',
        searchValue: id,
        fields: ['userName'],
        overrides: {},
      })),
    });
    frodo.idm.managed.queryManagedObjects
      .mockReset()
      .mockImplementation(async (type, filter) => {
        const id = /"(.*)"/.exec(filter)[1];
        attempted.push(id);
        if (failing.has(id)) return onFailing(id);
        return [{ _id: id }];
      });
  };
}

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
const { printError, printMessage, stopProgressIndicator } =
  spies.get(consoleTarget);
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

const textOf = (arg) =>
  arg instanceof Error
    ? [arg.message, ...(arg.originalErrors ?? []).map((e) => e.message)].join(
        ' '
      )
    : String(arg);
/** Everything the module printed or showed besides the summary. */
const consoleText = () =>
  [
    ...printError.mock.calls.map((args) => args.map(textOf).join(' ')),
    ...printMessage.mock.calls
      .filter(([text]) => !SUMMARY.test(String(text)))
      .map(([text]) => String(text)),
    ...stopProgressIndicator.mock.calls.map(([, message]) => String(message)),
  ].join('\n');

describe.each(CASES)('$name', (c) => {
  let attempted;
  let failing;
  const ctx = () => ({
    failing,
    attempted,
    spy,
    tmpFile: path.join(tmp, 'service-objects.json'),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-config-manager-'));
    attempted = [];
    failing = new Set(['b']);

    // the file system the library would give the command: real files below tmp
    frodo.utils.getWorkingDirectory.mockReset().mockImplementation(() => tmp);
    frodo.utils.getFilePath
      .mockReset()
      .mockImplementation((relative, create) => {
        const full = path.join(tmp, relative);
        if (create) {
          fs.mkdirSync(relative.endsWith('/') ? full : path.dirname(full), {
            recursive: true,
          });
        }
        return full;
      });
    frodo.utils.readJsonFile.mockReset().mockImplementation((file) => {
      let content;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch (error) {
        throw new FrodoError(`Error reading file ${file}`, error);
      }
      try {
        return JSON.parse(content);
      } catch (error) {
        throw new FrodoError(`Error parsing JSON from ${file}`, error);
      }
    });
    frodo.utils.saveJsonToFile.mockReset().mockImplementation((data, file) => {
      fs.writeFileSync(file, JSON.stringify(data));
    });
    frodo.utils.saveTextToFile.mockReset().mockImplementation((text, file) => {
      fs.writeFileSync(file, text);
    });
    frodo.utils.escapePlaceholders.mockReset().mockImplementation((x) => x);
    const frConfig = spy('src/utils/FrConfig');
    frConfig.fileFilter.mockReset().mockReturnValue(true);
    frConfig.lodashMerge
      .mockReset()
      .mockImplementation((a, b) => ({ ...a, ...b }));
    for (const identity of ['decodeOrNot', 'encodeOrNot', 'esvToEnv']) {
      frConfig[identity]?.mockReset().mockImplementation((value) => value);
    }

    c.arrange(ctx());
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const run = (allowFailures) => c.run(modules[c.file], allowFailures, ctx());

  test('runs every item after one failed, names it in one summary and fails', async () => {
    expect(await run()).toBe(false);

    expect(attempted).toEqual(IDS);
    // the failure itself is shown too, not only counted
    expect(consoleText()).toMatch(c.reason('b'));
    expect(summaries()).toHaveLength(1);
    expect(level()).toBe('error');
    expect(summary()).toMatch(
      new RegExp(
        `^1 of 3 ${c.unit}s failed:\\n {2}- ${c.summaryName('b').replace(/[/]/g, '\\/')}: ${c.reason('b')}`
      )
    );
    if (c.outputs) {
      expect(exists(c.outputs('a'))).toBe(true);
      expect(exists(c.outputs('b'))).toBe(false);
      expect(exists(c.outputs('c'))).toBe(true);
    }
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

  test('prints no summary when every item succeeds', async () => {
    failing = new Set();
    c.arrange(ctx());

    expect(await run()).toBe(true);
    expect(attempted).toEqual(IDS);
    expect(summaries()).toHaveLength(0);
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when what it reads cannot be read', async () => {
    c.readFailure.arrange(ctx());

    expect(await run(true)).toBe(false);

    expect(attempted).toEqual([]);
    expect(consoleText()).toMatch(c.readFailure.text);
    expect(summaries()).toHaveLength(0); // the problem is shown once, no summary
  });

  if (c.empty) {
    test('nothing to do is a success', async () => {
      c.empty(ctx());

      expect(await run()).toBe(true);
      expect(attempted).toEqual([]);
      expect(printError).not.toHaveBeenCalled();
      expect(summaries()).toHaveLength(0);
      if (c.emptyMessage) expect(consoleText()).toMatch(c.emptyMessage);
    });
  }

  for (const extra of c.extras ?? []) {
    test(extra.name, async () => {
      await extra.test(modules[c.file], ctx());
    });
  }
});
