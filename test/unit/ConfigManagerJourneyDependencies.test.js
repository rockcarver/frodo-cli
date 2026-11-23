import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { Command, Option } from 'commander';

/**
 * `config-manager pull journeys` and `push journeys` include what a journey needs by default, and
 * `--no-deps` leaves it out:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands). A pull writes the scripts that the journeys use and, for a
 * journey that is named, its inner journeys. A push reads them from the config folder, and a journey
 * whose script file, content file or inner journey file is missing is not pushed, and neither is a
 * journey that needs it; the others are pushed and the command exits 1 (a command that runs many
 * operations runs them all, then fails if any failed:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md).
 *
 * The operations run on a real temporary folder with the library a fake that records what it is
 * asked to write or import; the command files are the real ones, with the command class and the
 * login replaced.
 */

let workingDirectory;
let currentRealm;
let realms;
const exportJourneys = jest.fn();
const importJourneys = jest.fn();
const exportScript = jest.fn();
const validateJourneys = jest.fn();
const getTokens = jest.fn();
const printError = jest.fn();
const printMessage = jest.fn();
/** The files that the pull wrote, as paths relative to the working directory. */
const saved = [];

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    authn: {
      journey: {
        createSingleTreeExportTemplate: () => ({
          tree: {},
          nodes: {},
          innerNodes: {},
          scripts: {},
        }),
        exportJourneys,
        importJourneys,
        validateJourneys,
      },
    },
    script: { exportScript },
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        DEFAULT_REALM_KEY: '__default__realm__',
      },
      getFilePath: (file) => path.join(workingDirectory, file),
      readJsonFile: (file) => JSON.parse(fs.readFileSync(file, 'utf8')),
      saveJsonToFile: (data, file) => {
        saved.push(path.relative(workingDirectory, file));
        // a pull that does not end is a failure of the test, not a hang
        if (saved.length > 200) throw new Error('runaway recursion');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data));
      },
    },
  },
  state: {
    getDeploymentType: () => 'classic',
    getRealm: () => currentRealm,
    setRealm: (realm) => {
      currentRealm = realm;
    },
    getVerbose: () => false,
  },
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  // the content of a script goes to a file of its own, the config keeps the reference
  extractFrConfigDataToFile: (content, file) => ({ file }),
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  existScript: (id, realmDir) =>
    fs.existsSync(
      path.join(
        workingDirectory,
        'realms',
        realmDir,
        'scripts',
        'scripts-config',
        `${id}.json`
      )
    ),
  realmList: async () => realms,
  safeFileName: (name) => name,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  debugMessage: jest.fn(),
  printError,
  printMessage,
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(...args) {
      super(...args);
      this.argument('[host]')
        .argument('[realm]')
        .argument('[username]')
        .argument('[password]');
    }

    handleDefaultArgsAndOpts() {}
    usesRealm() {
      return this;
    }
    multiOp() {
      return this.addOption(new Option('--allow-failures'));
    }
  },
  ListOption: class extends Option {},
}));
jest.unstable_mockModule('../../src/ops/AuthenticateOps', () => ({
  getTokens,
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { command: (text) => text },
}));

const { configManagerExportJourneys, configManagerImportJourneys } =
  await import('../../src/configManagerOps/FrConfigJourneysOps');
const pullCommand = (
  await import('../../src/cli/config-manager/config-manager-pull/config-manager-pull-journeys')
).default;
const pushCommand = (
  await import('../../src/cli/config-manager/config-manager-push/config-manager-push-journeys')
).default;

const CONTEXT = 'AUTHENTICATION_TREE_DECISION_NODE';
const REALM = 'realms/alpha';

/** Writes files below the working directory: an object becomes JSON, a string is the text. */
function write(files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(workingDirectory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      typeof content === 'string' ? content : JSON.stringify(content)
    );
  }
}

/** A node that runs a script. */
const scripted = (id, script, more = {}) => ({
  _id: id,
  _type: { _id: 'ScriptedDecisionNode' },
  script,
  ...more,
});
/** A node that runs another journey. */
const inner = (id, tree) => ({
  _id: id,
  _type: { _id: 'InnerTreeEvaluatorNode' },
  tree,
});

/** The files of a journey as a pull writes them. */
function journeyFiles(name, nodes = []) {
  const files = {
    [`${REALM}/journeys/${name}/${name}.json`]: { _id: name },
  };
  for (const node of nodes) {
    files[`${REALM}/journeys/${name}/nodes/Node - ${node._id}.json`] = node;
  }
  return files;
}

/** The files of a script as a pull writes them, with its content file. */
function scriptFiles(id) {
  return {
    [`${REALM}/scripts/scripts-config/${id}.json`]: {
      _id: id,
      name: id,
      context: CONTEXT,
      script: { file: `scripts-content/${CONTEXT}/${id}.js` },
    },
    [`${REALM}/scripts/scripts-content/${CONTEXT}/${id}.js`]: `// ${id}`,
  };
}

/** What the push handed to the library for a realm: the journeys by name. */
const imported = () => importJourneys.mock.calls.map((call) => call[0].trees);
const importedNames = () => imported().flatMap((trees) => Object.keys(trees));

/** Every line that was printed, as text. */
const printed = () =>
  [
    ...printMessage.mock.calls.map(([text]) => String(text)),
    ...printError.mock.calls.map(([error, title]) =>
      [title, error?.message ?? String(error)].filter(Boolean).join('\n')
    ),
  ].join('\n');
const summary = () =>
  printMessage.mock.calls
    .map(([text]) => String(text))
    .find((text) => /^\d+ of \d+ journeys? failed/.test(text));

const push = (name, dependencies, allowFailures = false) =>
  configManagerImportJourneys(name, 'alpha', dependencies, true, allowFailures);

beforeEach(() => {
  workingDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'frodo-journey-dependencies-')
  );
  currentRealm = undefined;
  realms = ['alpha'];
  saved.length = 0;
  exportJourneys.mockReset();
  // every journey of the batch is imported, as the library reports it
  importJourneys
    .mockReset()
    .mockImplementation(async ({ trees }, _o, report) => {
      for (const name of Object.keys(trees)) report(undefined, trees[name]);
    });
  exportScript.mockReset().mockImplementation(async (id) => ({
    script: {
      [id]: { _id: id, name: id, context: CONTEXT, script: [`// ${id}`] },
    },
  }));
  validateJourneys.mockReset().mockResolvedValue([]);
  getTokens.mockReset().mockResolvedValue(true);
  printError.mockReset();
  printMessage.mockReset();
});

afterEach(() => {
  fs.rmSync(workingDirectory, { recursive: true, force: true });
  process.exitCode = 0;
});

describe('push journeys', () => {
  test('(a) a named journey brings its inner journey and the scripts of both, by default', async () => {
    write({
      ...journeyFiles('A', [scripted('a1', 'S1'), inner('a2', 'B')]),
      ...journeyFiles('B', [scripted('b1', 'S2')]),
      ...journeyFiles('Other', [scripted('o1', 'S3')]),
      ...scriptFiles('S1'),
      ...scriptFiles('S2'),
    });

    expect(await push('A', undefined)).toBe(true);

    expect(imported()).toHaveLength(1);
    expect(importedNames()).toEqual(['A', 'B']);
    const [trees] = imported();
    expect(Object.keys(trees.A.scripts)).toEqual(['S1']);
    expect(trees.A.scripts.S1.script).toEqual(['// S1']);
    expect(trees.B.scripts.S2.script).toEqual(['// S2']);
    expect(importJourneys.mock.calls[0][1]).toMatchObject({ deps: true });
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('(b) with the dependencies off a named journey is pushed alone and no script is read', async () => {
    // neither the scripts nor the inner journey are in the folder, and that does not matter
    write(journeyFiles('A', [scripted('a1', 'S1'), inner('a2', 'B')]));

    expect(await push('A', false)).toBe(true);

    expect(importedNames()).toEqual(['A']);
    expect(imported()[0].A.scripts).toEqual({});
    expect(importJourneys.mock.calls[0][1]).toMatchObject({ deps: false });
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('without a name the inner journeys are read, with the dependencies on or off', async () => {
    // the journeys of the folder are all pushed: a missing inner journey is still a failure
    write(journeyFiles('A', [inner('a1', 'B')]));

    expect(await push(undefined, false)).toBe(false);

    expect(importJourneys).not.toHaveBeenCalled();
    expect(summary()).toBe(
      "1 of 1 journey failed:\n  - alpha/A: Journey 'A' requires the journey 'B', but its file is missing: realms/alpha/journeys/B/B.json"
    );
    // the dependencies are off already, so the way out is not to push with the option again
    expect(printed()).toContain(
      'Pull the dependency too, or push the journey with -i.'
    );
    expect(printed()).not.toContain('--no-deps');
  });

  test('(c) a journey whose inner journey file is missing fails alone, and is not pushed', async () => {
    write({
      ...journeyFiles('A', [inner('a1', 'B')]),
      ...journeyFiles('C'),
    });

    expect(await push(undefined, true)).toBe(false);

    expect(importedNames()).toEqual(['C']);
    expect(summary()).toBe(
      "1 of 2 journeys failed:\n  - alpha/A: Journey 'A' requires the journey 'B', but its file is missing: realms/alpha/journeys/B/B.json"
    );
    expect(printed()).toContain(
      'Pull the dependency too, or push with --no-deps.'
    );
  });

  test('(c) the same for a named journey, also when the tenant has the inner journey', async () => {
    write(journeyFiles('A', [inner('a1', 'B')]));

    expect(await push('A', true)).toBe(false);

    expect(importJourneys).not.toHaveBeenCalled();
    expect(summary()).toContain(
      "alpha/A: Journey 'A' requires the journey 'B', but its file is missing"
    );
  });

  test('(d) a script whose file is missing fails the journey that needs it', async () => {
    write(journeyFiles('A', [scripted('a1', 'S')]));

    expect(await push('A', true)).toBe(false);

    expect(importJourneys).not.toHaveBeenCalled();
    expect(summary()).toBe(
      "1 of 1 journey failed:\n  - alpha/A: Journey 'A' requires the script 'S', but its file is missing: realms/alpha/scripts/scripts-config/S.json"
    );
    expect(printed()).toContain(
      'Pull the dependency too, or push with --no-deps.'
    );
  });

  test('(e) a script whose content file is missing fails the journey that needs it', async () => {
    write({
      ...journeyFiles('A', [scripted('a1', 'S')]),
      ...scriptFiles('S'),
    });
    fs.rmSync(
      path.join(
        workingDirectory,
        `${REALM}/scripts/scripts-content/${CONTEXT}/S.js`
      )
    );

    expect(await push('A', true)).toBe(false);

    expect(importJourneys).not.toHaveBeenCalled();
    expect(summary()).toBe(
      `1 of 1 journey failed:\n  - alpha/A: Journey 'A' requires the script 'S', but its content file is missing: realms/alpha/scripts/scripts-content/${CONTEXT}/S.js`
    );
  });

  test('the paths in the message do not hold the directory of the command', async () => {
    write(journeyFiles('A', [scripted('a1', 'S')]));

    await push('A', true);

    expect(printed()).not.toContain(workingDirectory);
  });

  test('(f) the other journeys are pushed, one summary names the journey that failed, and the command fails', async () => {
    write({
      ...journeyFiles('A', [scripted('a1', 'Missing')]),
      ...journeyFiles('C', [scripted('c1', 'S')]),
      ...scriptFiles('S'),
    });

    expect(await push(undefined, true)).toBe(false);

    expect(importedNames()).toEqual(['C']);
    expect(imported()[0].C.scripts.S.script).toEqual(['// S']);
    expect(summary()).toBe(
      "1 of 2 journeys failed:\n  - alpha/A: Journey 'A' requires the script 'Missing', but its file is missing: realms/alpha/scripts/scripts-config/Missing.json"
    );
    expect(printMessage.mock.calls.at(-1)[1]).toBe('error');
  });

  test('(f) --allow-failures prints the summary and succeeds', async () => {
    write({
      ...journeyFiles('A', [scripted('a1', 'Missing')]),
      ...journeyFiles('C'),
    });

    expect(await push(undefined, true, true)).toBe(true);

    expect(importedNames()).toEqual(['C']);
    expect(summary()).toContain("alpha/A: Journey 'A' requires the script");
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('(g) a journey whose inner journey cannot be pushed is named with it', async () => {
    // A is read first and reads B, which lacks a script: B fails, and so does A that needs it
    write({
      ...journeyFiles('A', [inner('a1', 'B')]),
      ...journeyFiles('B', [scripted('b1', 'Missing')]),
    });

    expect(await push('A', true)).toBe(false);

    expect(importJourneys).not.toHaveBeenCalled();
    const lines = summary().split('\n');
    expect(lines[0]).toBe('2 of 2 journeys failed:');
    expect(lines.slice(1).sort()).toEqual([
      "  - alpha/A: Journey 'B' requires the script 'Missing', but its file is missing: realms/alpha/scripts/scripts-config/Missing.json",
      "  - alpha/B: Journey 'B' requires the script 'Missing', but its file is missing: realms/alpha/scripts/scripts-config/Missing.json",
    ]);
  });

  test('(g) every journey on the way to the one that lacks a file fails, and each is named once', async () => {
    write({
      ...journeyFiles('A', [inner('a1', 'B')]),
      ...journeyFiles('B', [inner('b1', 'C')]),
      ...journeyFiles('C', [scripted('c1', 'Missing')]),
      ...journeyFiles('Fine'),
    });

    expect(await push(undefined, true)).toBe(false);

    expect(importedNames()).toEqual(['Fine']);
    const lines = summary().split('\n');
    expect(lines[0]).toBe('3 of 4 journeys failed:');
    expect(lines.slice(1).map((line) => line.split(':')[0])).toEqual(
      expect.arrayContaining(['  - alpha/A', '  - alpha/B', '  - alpha/C'])
    );
    expect(lines).toHaveLength(4);
  });

  test('(g) a journey that needs a journey that failed fails too, whatever the order of the folder', async () => {
    write({
      ...journeyFiles('A', [inner('a1', 'B')]),
      ...journeyFiles('B', [scripted('b1', 'Missing')]),
      ...journeyFiles('D', [inner('d1', 'B')]),
      ...journeyFiles('E'),
    });

    expect(await push(undefined, true)).toBe(false);

    expect(importedNames()).toEqual(['E']);
    const lines = summary().split('\n');
    expect(lines[0]).toBe('3 of 4 journeys failed:');
    expect(lines.slice(1).map((line) => line.split(':')[0])).toEqual(
      expect.arrayContaining(['  - alpha/A', '  - alpha/B', '  - alpha/D'])
    );
  });

  test('(h) a node whose script is [Empty], or that does not use its script, needs no file', async () => {
    write({
      ...journeyFiles('A', [
        scripted('a1', '[Empty]'),
        scripted('a2', 'NotThere', { useScript: false }),
      ]),
    });

    expect(await push('A', true)).toBe(true);

    expect(importedNames()).toEqual(['A']);
    expect(imported()[0].A.scripts).toEqual({});
    expect(printMessage).not.toHaveBeenCalled();
  });

  test('a journey that needs itself, or a journey that needs it, ends and is pushed once', async () => {
    write({
      ...journeyFiles('A', [inner('a1', 'B')]),
      ...journeyFiles('B', [inner('b1', 'A')]),
    });

    expect(await push('A', true)).toBe(true);

    expect(importedNames()).toEqual(['A', 'B']);
  });
});

describe('pull journeys', () => {
  /** The journeys of the realm as the library exports them. */
  function arrange(trees) {
    exportJourneys.mockReset().mockImplementation(async () => ({
      trees: Object.fromEntries(
        Object.entries(trees).map(([name, nodes]) => [
          name,
          {
            tree: {
              _id: name,
              nodes: Object.fromEntries(
                nodes.map((node) => [node._id, { displayName: node._id }])
              ),
            },
            nodes: Object.fromEntries(nodes.map((node) => [node._id, node])),
            innerNodes: {},
            scripts: {},
          },
        ])
      ),
    }));
  }
  const pull = (name, dependencies) =>
    configManagerExportJourneys(name, 'alpha', dependencies);
  const exists = (relative) =>
    fs.existsSync(path.join(workingDirectory, relative));
  const writes = (relative) => saved.filter((file) => file === relative).length;

  test('(i) a named journey is written with its inner journey and the scripts of both, by default', async () => {
    arrange({
      A: [scripted('a1', 'S1'), inner('a2', 'B'), inner('a3', 'B')],
      B: [scripted('b1', 'S1'), scripted('b2', 'S2')],
      Other: [scripted('o1', 'S3')],
    });

    expect(await pull('A', undefined)).toBe(true);

    expect(exists(`${REALM}/journeys/A/A.json`)).toBe(true);
    expect(exists(`${REALM}/journeys/Other/Other.json`)).toBe(false);
    // the inner journey is there, once, although two nodes of A run it
    expect(writes(`${REALM}/journeys/B/B.json`)).toBe(1);
    // a script is exported once, although three nodes use it
    expect(exportScript.mock.calls.map(([id]) => id)).toEqual(['S1', 'S2']);
    expect(exists(`${REALM}/scripts/scripts-config/S1.json`)).toBe(true);
    expect(exists(`${REALM}/scripts/scripts-config/S2.json`)).toBe(true);
    expect(exists(`${REALM}/scripts/scripts-config/S3.json`)).toBe(false);
  });

  test('(i) a script that is in the folder already is not exported again', async () => {
    write(scriptFiles('S1'));
    arrange({ A: [scripted('a1', 'S1')] });

    expect(await pull('A', true)).toBe(true);

    expect(exportScript).not.toHaveBeenCalled();
  });

  test('(i) with the dependencies off a journey is written alone, with no script', async () => {
    arrange({
      A: [scripted('a1', 'S1'), inner('a2', 'B')],
      B: [scripted('b1', 'S2')],
    });

    expect(await pull('A', false)).toBe(true);

    expect(exists(`${REALM}/journeys/A/A.json`)).toBe(true);
    expect(exists(`${REALM}/journeys/B/B.json`)).toBe(false);
    expect(exportScript).not.toHaveBeenCalled();
    expect(exists(`${REALM}/scripts`)).toBe(false);
  });

  test('without a name every journey is written, the scripts come with them, and nothing is written twice', async () => {
    arrange({
      A: [scripted('a1', 'S1'), inner('a2', 'B')],
      B: [scripted('b1', 'S1')],
    });

    expect(await pull(undefined, true)).toBe(true);

    expect(writes(`${REALM}/journeys/A/A.json`)).toBe(1);
    expect(writes(`${REALM}/journeys/B/B.json`)).toBe(1);
    expect(exportScript.mock.calls.map(([id]) => id)).toEqual(['S1']);
  });

  test('(i2) journeys that need each other end, and each is written once', async () => {
    arrange({
      A: [inner('a1', 'B'), scripted('a2', 'S1')],
      B: [inner('b1', 'A'), scripted('b2', 'S2')],
    });

    expect(await pull('A', true)).toBe(true);

    expect(writes(`${REALM}/journeys/A/A.json`)).toBe(1);
    expect(writes(`${REALM}/journeys/B/B.json`)).toBe(1);
    expect(exportScript.mock.calls.map(([id]) => id).sort()).toEqual([
      'S1',
      'S2',
    ]);
  });

  test('(h) a node whose script is [Empty], or that does not use its script, exports no script', async () => {
    arrange({
      A: [
        scripted('a1', '[Empty]'),
        scripted('a2', 'NotThere', { useScript: false }),
      ],
    });

    expect(await pull('A', true)).toBe(true);

    expect(exportScript).not.toHaveBeenCalled();
    expect(exists(`${REALM}/journeys/A/A.json`)).toBe(true);
  });
});

describe('the commands', () => {
  /** Runs the command as the shell would, and says what the library was asked. */
  async function run(setup, ...args) {
    process.exitCode = 0;
    const program = setup();
    program.exitOverride();
    program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
    await program.parseAsync([...args, 'matrix', 'alpha'], { from: 'user' });
  }

  test('(j) pull: the dependencies are on unless --no-deps is given', async () => {
    exportJourneys.mockResolvedValue({
      trees: {
        A: {
          tree: { _id: 'A', nodes: { a1: { displayName: 'a1' } } },
          nodes: { a1: scripted('a1', 'S1') },
          innerNodes: {},
          scripts: {},
        },
      },
    });

    await run(pullCommand, '-i', 'A');
    expect(exportScript.mock.calls.map(([id]) => id)).toEqual(['S1']);

    exportScript.mockClear();
    fs.rmSync(path.join(workingDirectory, 'realms'), { recursive: true });
    await run(pullCommand, '-i', 'A', '--no-deps');
    expect(exportScript).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  test('(j) push: the dependencies are on unless --no-deps is given', async () => {
    write({
      ...journeyFiles('A', [scripted('a1', 'Missing')]),
    });

    // the script is not in the folder: the journey fails, and the command exits 1
    await run(pushCommand, '-i', 'A');
    expect(importJourneys).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);

    await run(pushCommand, '-i', 'A', '--no-deps');
    expect(importedNames()).toEqual(['A']);
    expect(importJourneys.mock.calls[0][1]).toMatchObject({ deps: false });
    expect(process.exitCode).toBe(0);
  });

  test('(j) push: --allow-failures keeps the exit code at 0 and the summary is printed', async () => {
    write({
      ...journeyFiles('A', [scripted('a1', 'Missing')]),
      ...journeyFiles('C'),
    });

    await run(pushCommand, '--allow-failures');

    expect(importedNames()).toEqual(['C']);
    expect(summary()).toContain('alpha/A');
    expect(process.exitCode).toBe(0);
  });

  test.each([
    ['pull', () => pullCommand, '--pull-dependencies'],
    ['push', () => pushCommand, '--push-dependencies'],
  ])('(j) %s: %s is not an option any more', async (_verb, setup, option) => {
    await expect(run(setup(), option)).rejects.toMatchObject({
      code: 'commander.unknownOption',
    });
    await expect(run(setup(), '-d')).rejects.toMatchObject({
      code: 'commander.unknownOption',
    });
  });

  test('(j) both commands declare --no-deps and nothing else for the dependencies', () => {
    for (const setup of [pullCommand, pushCommand]) {
      const program = setup();
      const options = program.options.filter((option) =>
        /dependenc|deps/.test(option.long)
      );

      expect(options.map((option) => option.flags)).toEqual(['--no-deps']);
      expect(options[0].negate).toBe(true);
      expect(options[0].short).toBeUndefined();
    }
  });
});

describe('MIGRATION.md', () => {
  const migration = fs.readFileSync(
    new URL('../../MIGRATION.md', import.meta.url),
    'utf8'
  );

  /** The entry of this change: from its first line to the entry that follows it. */
  const entry = (() => {
    const start = migration.indexOf(
      '**`pull journeys` and `push journeys` include what a journey needs'
    );
    const end = migration.indexOf('\n**', start + 1);
    return start === -1 ? undefined : migration.slice(start, end);
  })();

  test('(j) says that journeys include their dependencies by default and that --no-deps turns it off', () => {
    expect(entry).toBeDefined();
    expect(entry).toContain('--no-deps');
    expect(entry).toContain('--pull-dependencies');
    expect(entry).toContain('--push-dependencies');
    expect(entry).toContain('exit code 1');
    expect(entry).toContain('is not pushed');
    expect(entry).toContain(
      'https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md'
    );
  });

  test('the two options are not in the table of the options that are left with a long form only', () => {
    const rows = migration
      .split('\n')
      .filter((line) => /^\|\s*`-d, --(pull|push)-dependencies`/.test(line));

    expect(rows).toEqual([]);
  });
});
