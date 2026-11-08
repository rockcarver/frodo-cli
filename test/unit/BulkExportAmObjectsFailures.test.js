import fs from 'node:fs';
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
 * Decision record 0040 for the exports of AM objects: `journey export`,
 * `script export`, `theme export`, `node export`, `email template export` and
 * `service export`, with `-A` (one file per object) and, where the library
 * reports every object to a result callback (journeys, scripts), `-a` (one
 * file). When one object cannot be exported, the others still are, one summary
 * names the failed one, and the command fails, unless --allow-failures was
 * given. A failure to read the objects fails the command whatever the flag
 * says. Nothing to export is not a failure (record 0041).
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

const FILES = [
  'src/ops/JourneyOps.ts',
  'src/ops/ScriptOps.ts',
  'src/ops/ThemeOps.ts',
  'src/ops/NodeOps.ts',
  'src/ops/EmailTemplateOps.ts',
  'src/ops/ServiceOps.ts',
];

// every relative import of the modules under test becomes spies, except the
// run tracker and the modules under test themselves
const modulesUnderTest = new Set(
  FILES.map((file) => path.resolve(root, file).replace(/\.ts$/, ''))
);
const realModules = new Set(['/utils/OperationRun', '/utils/ErrorCause']);
const mocked = new Map();
for (const file of FILES) {
  const source = fs.readFileSync(path.resolve(root, file), 'utf8');
  const importer = path.dirname(path.resolve(root, file));
  for (const [, clause, from] of source.matchAll(
    /^import (?!type )([^;]*?) from '(\.[^']+)';/gms
  )) {
    const target = path.resolve(importer, from).replace(/\.(js|ts)$/, '');
    if (
      modulesUnderTest.has(target) ||
      [...realModules].some((real) => target.endsWith(real))
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
  new Set([
    ...(mocked.get(consoleTarget) ?? []),
    'printError',
    'printMessage',
    'createProgressIndicator',
    'stopProgressIndicator',
    'updateProgressIndicator',
  ])
);
const spies = new Map();
for (const [target, names] of mocked) {
  const exports = {};
  for (const name of names) exports[name] = jest.fn();
  spies.set(target, exports);
  jest.unstable_mockModule(target, () => exports);
}
const { printError, printMessage } = spies.get(consoleTarget);
const { extractDataToFile } = spies.get(path.resolve(root, 'src/utils/Config'));
const { filterScriptExport } = spies.get(
  path.resolve(root, 'src/ops/utils/ScriptFilters')
);

const modules = {};
for (const file of FILES) {
  modules[file] = await import(path.resolve(root, file));
}

const IDS = ['a', 'b', 'c', 'd'];

/** The error the library throws when it cannot read what there is to export. */
const readError = () =>
  new FrodoError('Error reading the objects', [new Error('read failed')]);
/** The error a file writer throws (lib 5.0.0-26 and later). */
const writeError = (id) =>
  new FrodoError(`Error saving ${id}.json`, [new Error('disk full')]);

/**
 * `arrange(mode, saved)` sets up the library stubs. The modes are `oneFails`
 * (object b cannot be exported), `clean`, `readFails` and `empty`. `saved` is
 * filled with the ids of the objects whose file was written (or tried).
 * `reason` is what the summary says about the failed object.
 */
const CASES = [
  {
    name: 'journey export -A',
    file: 'src/ops/JourneyOps.ts',
    fn: 'exportJourneysToFiles',
    args: [true, {}],
    unit: 'journeys',
    // the library reports a journey that cannot be exported to the callback
    failedLine:
      '  - Error exporting the alpha realm journey b: could not export b',
    // the library has already left b out when the files are written
    savedWhenOneFails: ['a', 'c', 'd'],
    arrange: (mode, saved) => {
      frodo.utils.saveJsonToFile.mockReset().mockImplementation((data) => {
        saved.push(Object.keys(data.trees)[0]);
      });
      frodo.authn.journey.exportJourneys
        .mockReset()
        .mockImplementation(async (_options, callback) => {
          if (mode === 'readFails') throw readError();
          const trees = {};
          for (const id of mode === 'empty' ? [] : IDS) {
            if (mode === 'oneFails' && id === 'b') {
              callback(
                new FrodoError('Error exporting the alpha realm journey b', [
                  new Error('could not export b'),
                ])
              );
              continue;
            }
            callback(undefined, { tree: { _id: id } });
            trees[id] = { tree: { _id: id } };
          }
          return { trees };
        });
    },
  },
  {
    name: 'script export -A',
    file: 'src/ops/ScriptOps.ts',
    fn: 'exportScriptsToFiles',
    args: [false, true, false, {}, {}],
    unit: 'scripts',
    failedLine: '  - b: could not export b',
    savedWhenOneFails: ['a', 'c', 'd'],
    arrange: (mode, saved) => {
      frodo.utils.saveToFile.mockReset().mockImplementation((_type, script) => {
        saved.push(script._id);
      });
      frodo.script.exportScripts
        .mockReset()
        .mockImplementation(async (_options, callback) => {
          if (mode === 'readFails') throw readError();
          const script = {};
          for (const id of mode === 'empty' ? [] : IDS) {
            if (mode === 'oneFails' && id === 'b') {
              callback(
                new FrodoError('Error exporting alpha realm script b', [
                  new Error('could not export b'),
                ])
              );
              continue;
            }
            callback(undefined, { _id: id, name: id });
            script[id] = { _id: id, name: id };
          }
          return { script };
        });
    },
  },
  {
    name: 'theme export -A',
    file: 'src/ops/ThemeOps.ts',
    fn: 'exportThemesToFiles',
    args: [true, false],
    unit: 'themes',
    // the library reads the themes in one call; a file that cannot be written fails its theme
    failedLine: '  - b: Error saving b.json',
    savedWhenOneFails: ['a', 'b', 'c', 'd'],
    arrange: (mode, saved) => {
      frodo.utils.saveToFile.mockReset().mockImplementation((_type, theme) => {
        saved.push(theme._id);
        if (mode === 'oneFails' && theme._id === 'b') throw writeError('b');
      });
      frodo.theme.readThemes.mockReset().mockImplementation(async () => {
        if (mode === 'readFails') throw readError();
        return (mode === 'empty' ? [] : IDS).map((id) => ({
          _id: id,
          name: id,
        }));
      });
    },
  },
  {
    name: 'node export -A',
    file: 'src/ops/NodeOps.ts',
    fn: 'exportCustomNodesToFiles',
    args: [true, false, {}],
    unit: 'custom nodes',
    failedLine: '  - b: Error saving b.json',
    savedWhenOneFails: ['a', 'b', 'c', 'd'],
    arrange: (mode, saved) => {
      frodo.utils.saveToFile.mockReset().mockImplementation((_type, node) => {
        saved.push(node._id);
        if (mode === 'oneFails' && node._id === 'b') throw writeError('b');
      });
      frodo.authn.node.exportCustomNodes
        .mockReset()
        .mockImplementation(async () => {
          if (mode === 'readFails') throw readError();
          return {
            nodeTypes: Object.fromEntries(
              (mode === 'empty' ? [] : IDS).map((id) => [
                id,
                { _id: id, displayName: id, script: 'x' },
              ])
            ),
          };
        });
    },
  },
  {
    name: 'email template export -A',
    file: 'src/ops/EmailTemplateOps.ts',
    fn: 'exportEmailTemplatesToFiles',
    args: [true],
    unit: 'email templates',
    failedLine: '  - b: Error saving b.json',
    savedWhenOneFails: ['a', 'b', 'c', 'd'],
    arrange: (mode, saved) => {
      frodo.utils.saveJsonToFile.mockReset().mockImplementation((data) => {
        const id = Object.keys(data.emailTemplate)[0];
        saved.push(id);
        if (mode === 'oneFails' && id === 'b') throw writeError('b');
      });
      frodo.email.template.exportEmailTemplates
        .mockReset()
        .mockImplementation(async () => {
          if (mode === 'readFails') throw readError();
          return {
            emailTemplate: Object.fromEntries(
              (mode === 'empty' ? [] : IDS).map((id) => [id, { _id: id }])
            ),
          };
        });
    },
  },
  {
    name: 'service export -A',
    file: 'src/ops/ServiceOps.ts',
    fn: 'exportServicesToFiles',
    args: [false, true],
    unit: 'services',
    failedLine: '  - b: Error saving b.json',
    savedWhenOneFails: ['a', 'b', 'c', 'd'],
    arrange: (mode, saved) => {
      frodo.service.createServiceExportTemplate
        .mockReset()
        .mockImplementation(() => ({ service: {} }));
      frodo.utils.saveJsonToFile.mockReset().mockImplementation((data) => {
        const id = Object.keys(data.service)[0];
        saved.push(id);
        if (mode === 'oneFails' && id === 'b') throw writeError('b');
      });
      frodo.service.getFullServices.mockReset().mockImplementation(async () => {
        if (mode === 'readFails') throw readError();
        return (mode === 'empty' ? [] : IDS).map((id) => ({
          _type: { _id: id },
        }));
      });
    },
  },
];

const summary = () =>
  printMessage.mock.calls
    .map(([text]) => text)
    .filter((text) => /\bfailed:/.test(text))
    .join('\n');
const summaryLevel = () =>
  printMessage.mock.calls.find(([text]) => /\bfailed:/.test(text))?.[1];

let exitCodeBefore;
beforeEach(() => {
  jest.clearAllMocks();
  frodo.utils.getTypedFilename
    .mockReset()
    .mockImplementation((name) => String(name));
  frodo.utils.getFilePath.mockReset().mockImplementation((name) => name);
  filterScriptExport.mockReset().mockImplementation((data) => data);
  extractDataToFile.mockReset().mockImplementation((_text, file) => file);
  exitCodeBefore = process.exitCode;
  process.exitCode = undefined;
});
afterEach(() => {
  process.exitCode = exitCodeBefore;
});

describe.each(CASES)('$name', (c) => {
  let saved;
  beforeEach(() => {
    saved = [];
  });
  const run = (allowFailures) =>
    modules[c.file][c.fn](...c.args, allowFailures);

  test('exports every object after one failed, names it in one summary and fails', async () => {
    c.arrange('oneFails', saved);

    expect(await run()).toBe(false);

    expect(saved).toEqual(c.savedWhenOneFails);
    // the failure itself is shown too, not only counted
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('error');
    expect(summary()).toBe(`1 of 4 ${c.unit} failed:\n${c.failedLine}`);
    // the ops function leaves the exit code to its caller (record 0033)
    expect(process.exitCode).toBeUndefined();
  });

  test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
    c.arrange('oneFails', saved);

    expect(await run(true)).toBe(true);

    expect(saved).toEqual(c.savedWhenOneFails);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summaryLevel()).toBe('warn');
    expect(summary()).toContain(`${c.unit} failed`);
    expect(summary()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('prints no summary and no error when nothing failed', async () => {
    c.arrange('clean', saved);

    expect(await run()).toBe(true);

    expect(saved).toEqual(IDS);
    expect(summary()).toBe('');
    expect(printError).not.toHaveBeenCalled();
  });

  test('fails whatever --allow-failures says when it cannot read what there is to export', async () => {
    c.arrange('readFails', saved);

    expect(await run(true)).toBe(false);

    expect(saved).toEqual([]);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe(''); // the error is shown once, no summary
  });

  test('nothing to export is not a failure (record 0041)', async () => {
    c.arrange('empty', saved);

    expect(await run()).toBe(true);

    expect(saved).toEqual([]);
    expect(summary()).toBe('');
    expect(printError).not.toHaveBeenCalled();
  });
});

describe('journey export -A and script export -A: a file that cannot be written', () => {
  test.each(CASES.slice(0, 2))(
    '$name: names the object whose file failed, next to the one the library could not export',
    async (c) => {
      const saved = [];
      c.arrange('oneFails', saved);
      // the library could not export b; the file of c cannot be written
      const write =
        c.file === 'src/ops/JourneyOps.ts'
          ? frodo.utils.saveJsonToFile
          : frodo.utils.saveToFile;
      const original = write.getMockImplementation();
      write.mockImplementation((...args) => {
        original(...args);
        if (saved.at(-1) === 'c') throw writeError('c');
      });

      expect(await modules[c.file][c.fn](...c.args)).toBe(false);

      expect(saved).toEqual(['a', 'c', 'd']);
      expect(summary()).toBe(
        `2 of 4 ${c.unit} failed:\n${c.failedLine}\n  - c: Error saving c.json`
      );
      expect(printError).toHaveBeenCalledTimes(2);
    }
  );
});

describe('journey export -a and script export -a', () => {
  const ALL_CASES = [
    {
      name: 'journey export -a',
      file: 'src/ops/JourneyOps.ts',
      fn: 'exportJourneysToFile',
      args: [undefined, true, {}],
      unit: 'journeys',
      failedLine:
        '  - Error exporting the alpha realm journey b: could not export b',
      write: () => frodo.utils.saveJsonToFile,
      arrange: (mode) => {
        frodo.utils.saveJsonToFile.mockReset();
        frodo.authn.journey.exportJourneys
          .mockReset()
          .mockImplementation(async (_options, callback) => {
            if (mode === 'readFails') throw readError();
            for (const id of IDS) {
              if (mode === 'oneFails' && id === 'b') {
                callback(
                  new FrodoError('Error exporting the alpha realm journey b', [
                    new Error('could not export b'),
                  ])
                );
              } else {
                callback(undefined, { tree: { _id: id } });
              }
            }
            return { trees: {} };
          });
      },
    },
    {
      name: 'script export -a',
      file: 'src/ops/ScriptOps.ts',
      fn: 'exportScriptsToFile',
      args: [undefined, true, false, {}, {}],
      unit: 'scripts',
      failedLine: '  - b: could not export b',
      write: () => frodo.utils.saveJsonToFile,
      arrange: (mode) => {
        frodo.utils.saveJsonToFile.mockReset();
        frodo.script.exportScripts
          .mockReset()
          .mockImplementation(async (_options, callback) => {
            if (mode === 'readFails') throw readError();
            for (const id of IDS) {
              if (mode === 'oneFails' && id === 'b') {
                callback(
                  new FrodoError('Error exporting alpha realm script b', [
                    new Error('could not export b'),
                  ])
                );
              } else {
                callback(undefined, { _id: id, name: id });
              }
            }
            return { script: {} };
          });
      },
    },
  ];

  describe.each(ALL_CASES)('$name', (c) => {
    const run = (allowFailures) =>
      modules[c.file][c.fn](...c.args, allowFailures);

    test('writes the file with what could be exported, names the failed object in one summary and fails', async () => {
      c.arrange('oneFails');

      expect(await run()).toBe(false);

      expect(c.write().mock.calls).toHaveLength(1);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(summaryLevel()).toBe('error');
      expect(summary()).toBe(`1 of 4 ${c.unit} failed:\n${c.failedLine}`);
      expect(process.exitCode).toBeUndefined();
    });

    test('--allow-failures keeps the command successful, still printing the failure and the summary as a warning', async () => {
      c.arrange('oneFails');

      expect(await run(true)).toBe(true);

      expect(c.write().mock.calls).toHaveLength(1);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(summaryLevel()).toBe('warn');
      expect(summary()).toContain(
        'The exit code stays 0 because --allow-failures was given.'
      );
    });

    test('prints no summary and no error when nothing failed', async () => {
      c.arrange('clean');

      expect(await run()).toBe(true);

      expect(c.write().mock.calls).toHaveLength(1);
      expect(summary()).toBe('');
      expect(printError).not.toHaveBeenCalled();
    });

    test('fails whatever --allow-failures says when it cannot read the objects, and writes nothing', async () => {
      c.arrange('readFails');

      expect(await run(true)).toBe(false);

      expect(c.write().mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
      expect(summary()).toBe('');
    });

    test('fails whatever --allow-failures says when the file cannot be written', async () => {
      c.arrange('clean');
      c.write().mockImplementation(() => {
        throw writeError('all');
      });

      expect(await run(true)).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
      expect(summary()).toBe('');
    });

    test('names the failed object even when the file cannot be written either', async () => {
      c.arrange('oneFails');
      c.write().mockImplementation(() => {
        throw writeError('all');
      });

      expect(await run(true)).toBe(false);

      expect(printError.mock.calls.length).toBe(2);
      expect(summary()).toContain(`1 of 4 ${c.unit} failed:`);
    });
  });
});

describe('the other -a exports read everything in one call and write one file: one operation', () => {
  const SINGLE_CASES = [
    {
      name: 'theme export -a',
      file: 'src/ops/ThemeOps.ts',
      fn: 'exportThemesToFile',
      read: () => frodo.theme.exportThemes,
      write: () => frodo.utils.saveJsonToFile,
      data: { theme: {} },
    },
    {
      name: 'node export -a',
      file: 'src/ops/NodeOps.ts',
      fn: 'exportCustomNodesToFile',
      args: [undefined],
      read: () => frodo.authn.node.exportCustomNodes,
      write: () => frodo.utils.saveJsonToFile,
      data: { nodeTypes: {} },
    },
    {
      name: 'email template export -a',
      file: 'src/ops/EmailTemplateOps.ts',
      fn: 'exportEmailTemplatesToFile',
      read: () => frodo.email.template.exportEmailTemplates,
      write: () => frodo.utils.saveJsonToFile,
      data: { emailTemplate: {} },
    },
    {
      name: 'service export -a',
      file: 'src/ops/ServiceOps.ts',
      fn: 'exportServicesToFile',
      args: [undefined],
      read: () => frodo.service.exportServices,
      write: () => frodo.utils.saveJsonToFile,
      data: { service: {} },
    },
  ];

  describe.each(SINGLE_CASES)('$name', (c) => {
    const run = () => modules[c.file][c.fn](...(c.args ?? [undefined]));

    test('writes the file', async () => {
      c.read().mockReset().mockResolvedValue(c.data);
      c.write().mockReset();

      expect(await run()).toBe(true);

      expect(c.write().mock.calls).toHaveLength(1);
      expect(printError).not.toHaveBeenCalled();
    });

    test('fails once, with the error, when it cannot read the objects', async () => {
      c.read().mockReset().mockRejectedValue(readError());
      c.write().mockReset();

      expect(await run()).toBe(false);

      expect(c.write().mock.calls).toHaveLength(0);
      expect(printError).toHaveBeenCalledTimes(1);
    });

    test('fails once, with the error, when it cannot write the file', async () => {
      c.read().mockReset().mockResolvedValue(c.data);
      c.write()
        .mockReset()
        .mockImplementation(() => {
          throw writeError('all');
        });

      expect(await run()).toBe(false);

      expect(printError).toHaveBeenCalledTimes(1);
    });
  });
});

describe('a script, theme or custom node whose code or HTML cannot be extracted is a failure, not a silent success', () => {
  /** extractDataToFile fails for the file of b */
  const failExtractOfB = () =>
    extractDataToFile.mockImplementation((_text, file, directory) => {
      if (file.includes('b') || directory === 'b') {
        throw new Error('cannot write the extract');
      }
      return file;
    });

  test('script export -A -x: b is a failed script, the others are saved', async () => {
    const saved = [];
    CASES[1].arrange('clean', saved);
    frodo.script.exportScripts
      .mockReset()
      .mockImplementation(async (_options, callback) => {
        const script = {};
        for (const id of IDS) {
          callback(undefined, { _id: id, name: id });
          script[id] = {
            _id: id,
            name: id,
            language: 'JAVASCRIPT',
            script: 'x',
          };
        }
        return { script };
      });
    failExtractOfB();

    expect(
      await modules['src/ops/ScriptOps.ts'].exportScriptsToFiles(
        true,
        true,
        false,
        {},
        {}
      )
    ).toBe(false);

    expect(saved).toEqual(['a', 'c', 'd']);
    // extractScriptsToFiles printed the error already, so it is shown once
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe('1 of 4 scripts failed:\n  - b');
  });

  test('theme export -A -x: b is a failed theme, the others are saved', async () => {
    const saved = [];
    CASES[2].arrange('clean', saved);
    frodo.theme.readThemes
      .mockReset()
      .mockResolvedValue(
        IDS.map((id) => ({ _id: id, name: id, journeyFooter: '<p>x</p>' }))
      );
    failExtractOfB();

    expect(
      await modules['src/ops/ThemeOps.ts'].exportThemesToFiles(true, true)
    ).toBe(false);

    expect(saved).toEqual(['a', 'c', 'd']);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe('1 of 4 themes failed:\n  - b');
  });

  test('node export -A -x: b is a failed custom node, the others are saved', async () => {
    const saved = [];
    CASES[3].arrange('clean', saved);
    failExtractOfB();

    expect(
      await modules['src/ops/NodeOps.ts'].exportCustomNodesToFiles(true, true)
    ).toBe(false);

    expect(saved).toEqual(['a', 'c', 'd']);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(summary()).toBe('1 of 4 custom nodes failed:\n  - b');
  });

  test('script export -i -x fails and writes nothing', async () => {
    frodo.script.exportScript.mockReset().mockResolvedValue({
      script: {
        b: { _id: 'b', name: 'b', language: 'JAVASCRIPT', script: 'x' },
      },
    });
    frodo.utils.saveJsonToFile.mockReset();
    failExtractOfB();

    expect(
      await modules['src/ops/ScriptOps.ts'].exportScriptToFile(
        'b',
        undefined,
        true,
        false,
        true,
        {}
      )
    ).toBe(false);

    expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(0);
  });

  test('theme export -n -x fails and writes nothing', async () => {
    frodo.theme.readThemeByName
      .mockReset()
      .mockResolvedValue({ _id: 'b', name: 'b', journeyFooter: '<p>x</p>' });
    frodo.utils.saveToFile.mockReset();
    failExtractOfB();

    expect(
      await modules['src/ops/ThemeOps.ts'].exportThemeByName(
        'b',
        undefined,
        true,
        true
      )
    ).toBe(false);

    expect(frodo.utils.saveToFile.mock.calls).toHaveLength(0);
  });

  test('node export -i -x fails and writes nothing', async () => {
    frodo.authn.node.exportCustomNode.mockReset().mockResolvedValue({
      nodeTypes: {
        b: { _id: 'b', displayName: 'b', serviceName: 'b', script: 'x' },
      },
    });
    frodo.utils.saveJsonToFile.mockReset();
    failExtractOfB();

    expect(
      await modules['src/ops/NodeOps.ts'].exportCustomNodeToFile(
        'b',
        undefined,
        undefined,
        true,
        true
      )
    ).toBe(false);

    expect(frodo.utils.saveJsonToFile.mock.calls).toHaveLength(0);
  });
});
