import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * A pull of journeys writes the scripts that the journeys use, and the tenant names them: the id
 * of a script, its name and its context become file names. Whatever the tenant says, these names
 * are file names inside the config folder, never paths
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0059-a-selector-is-an-id-or-a-name-never-a-path.md,
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0061-a-file-reference-must-stay-inside-the-config-folder.md),
 * and a push of the folder finds what the pull wrote. The library functions that build a path and
 * write a file are the real ones, with the directory option set to a folder deep inside a
 * temporary folder: everything that a pull writes is looked for there, and a file that went up
 * lands in the temporary folder, where it is found and fails the test.
 */

const realLib = await import('@rockcarver/frodo-lib');
const exportJourneys = jest.fn();
const exportScript = jest.fn();
const importJourneys = jest.fn();
const printed = [];

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  ...realLib,
  frodo: {
    ...realLib.frodo,
    authn: {
      ...realLib.frodo.authn,
      journey: {
        ...realLib.frodo.authn.journey,
        exportJourneys,
        importJourneys,
        validateJourneys: async () => [],
      },
    },
    script: { ...realLib.frodo.script, exportScript },
  },
}));
// the console: what the commands print is kept, everything else the module offers does nothing
const consoleNames = [
  ...fs
    .readFileSync(
      new URL('../../src/utils/Console.ts', import.meta.url),
      'utf8'
    )
    .matchAll(/^export (?:async )?(?:function|const) (\w+)/gm),
].map((match) => match[1]);
jest.unstable_mockModule('../../src/utils/Console', () => ({
  ...Object.fromEntries(consoleNames.map((name) => [name, () => {}])),
  printMessage: (msg) => printed.push(String(msg)),
  printError: (error, message) =>
    printed.push(`${message ?? ''} ${error?.message ?? error}`.trim()),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));

const { configManagerExportJourneys, configManagerImportJourneys } =
  await import('../../src/configManagerOps/FrConfigJourneysOps.ts');

const CONTEXT = 'AUTHENTICATION_TREE_DECISION_NODE';

/** The temporary folder, the folder of the command inside it (deep, so that a path that goes up stays inside the temporary folder), the config folder. */
let root;
let configFolder;
let directoryBefore;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-script-names-'));
  configFolder = path.join(root, 'a', 'b', 'c', 'd', 'config');
  fs.mkdirSync(configFolder, { recursive: true });
  directoryBefore = realLib.state.getDirectory();
  realLib.state.setDirectory(configFolder);
  printed.length = 0;
  exportScript.mockReset();
  importJourneys
    .mockReset()
    .mockImplementation(async ({ trees }, _options, report) => {
      for (const name of Object.keys(trees)) report(undefined, trees[name]);
    });
  exportJourneys.mockReset().mockImplementation(async () => ({
    trees: {
      A: {
        tree: { _id: 'A', nodes: { a1: { displayName: 'a1' } } },
        nodes: {
          a1: {
            _id: 'a1',
            _type: { _id: 'ScriptedDecisionNode' },
            script: scriptId,
          },
        },
        innerNodes: {},
        scripts: {},
      },
    },
  }));
});

afterEach(() => {
  realLib.state.setDirectory(directoryBefore);
  fs.rmSync(root, { recursive: true, force: true });
});

/** The script that the tenant has: `name`, `context` and `_id` are what a test makes hostile. */
let scriptId;
let scriptOf;
function tenantScript(fields) {
  scriptId = fields._id ?? 'S1';
  scriptOf = {
    _id: scriptId,
    name: 'S1',
    context: CONTEXT,
    script: 'CONTENT-OF-THE-SCRIPT',
    ...fields,
  };
  exportScript.mockImplementation(async () => ({
    script: { [scriptId]: { ...scriptOf } },
  }));
}

/** Every file below a folder, as a path. */
function filesBelow(folder) {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesBelow(path.join(folder, entry.name))
        : [path.join(folder, entry.name)]
    );
}

const pull = () => configManagerExportJourneys('A', 'alpha', true);
const push = () => configManagerImportJourneys('A', 'alpha', true);

/** The names that a tenant could give, by what is wrong with them. */
const HOSTILE = [
  ['goes up', '../../../../../../../ESCAPE'],
  ['goes up by backslashes', '..\\..\\..\\..\\..\\..\\..\\ESCAPE'],
  ['has a slash', 'a/b'],
  ['has a backslash', 'a\\b'],
  ['has a drive letter', 'C:\\ESCAPE'],
  ['hides the way up in C:', '..C:/..C:/..C:/..C:/..C:/..C:/..C:/ESCAPE'],
  ['holds a control character', 'x\u0001y\u001b[31m'],
  ['is very long', 'n'.repeat(400)],
  ['is only dots', '..'],
  ['is one dot', '.'],
  ['is three dots', '...'],
];

describe.each(['name', 'context', '_id'])(
  'a script whose %s is a hostile name',
  (field) => {
    // a name that leaves no name for a file (`.`, `..`) or that no file name can hold (more than 255
    // bytes) is not written: the journey fails, and nothing is written outside the config folder
    // the name of a script is written as the file name of a name, which is empty for any run of dots
    const REFUSED = [
      'is only dots',
      'is one dot',
      'is very long',
      ...(field === 'name' ? ['is three dots'] : []),
    ];
    const names = HOSTILE.filter(([what]) => !REFUSED.includes(what));

    test.each(HOSTILE.filter(([what]) => REFUSED.includes(what)))(
      'that %s names no file: the journey fails, and nothing is written outside the config folder',
      async (_what, name) => {
        tenantScript({ [field]: name });

        expect(await pull()).toBe(false);

        expect(fs.readdirSync(root)).toEqual(['a']);
        for (const file of filesBelow(root)) {
          expect(file.startsWith(`${configFolder}${path.sep}`)).toBe(true);
        }
      }
    );

    test.each(names)(
      'that %s is written inside the config folder, and nothing else is',
      async (_what, name) => {
        tenantScript({ [field]: name });

        expect(await pull()).toBe(true);

        // nothing outside the config folder, whatever the name did
        expect(fs.readdirSync(root)).toEqual(['a']);
        const files = filesBelow(root);
        expect(files.length).toBeGreaterThan(2);
        for (const file of files) {
          expect(file.startsWith(`${configFolder}${path.sep}`)).toBe(true);
        }
        // the folder of the script holds its two files, and no other script
        const scripts = path.join(configFolder, 'realms', 'alpha', 'scripts');
        expect(
          filesBelow(scripts).filter((file) => file.includes('scripts-config'))
        ).toHaveLength(1);
        expect(
          filesBelow(scripts).filter((file) => file.includes('scripts-content'))
        ).toHaveLength(1);
      }
    );

    test.each(names)(
      'that %s: the folder is pushed back with the script, and a second pull leaves the script alone',
      async (_what, name) => {
        tenantScript({ [field]: name });

        expect(await pull()).toBe(true);
        expect(await pull()).toBe(true);
        expect(exportScript).toHaveBeenCalledTimes(1);

        expect(await push()).toBe(true);

        const [{ trees }] = importJourneys.mock.calls.map((call) => call[0]);
        // the text that was pulled, as the lines of the file (the file ends with a line break)
        expect(trees.A.scripts[scriptId].script.join('\n').trim()).toBe(
          'CONTENT-OF-THE-SCRIPT'
        );
      }
    );
  }
);

describe('a script with ordinary names', () => {
  test('is written where it always was', async () => {
    tenantScript({ _id: 'S1', name: 'My script', context: CONTEXT });

    expect(await pull()).toBe(true);

    const scripts = path.join(configFolder, 'realms', 'alpha', 'scripts');
    expect(fs.readdirSync(path.join(scripts, 'scripts-config'))).toEqual([
      'S1.json',
    ]);
    expect(
      fs.readdirSync(path.join(scripts, 'scripts-content', CONTEXT))
    ).toEqual(['My script.js']);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(scripts, 'scripts-config', 'S1.json'), 'utf8')
      ).script
    ).toEqual({ file: `scripts-content/${CONTEXT}/My script.js` });
  });
});
