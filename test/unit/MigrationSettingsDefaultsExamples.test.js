import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * The commands that MIGRATION.md gives to clear saved defaults run as written. The saved defaults
 * (`--prompt --save-defaults`) are kept in ~/.frodo/Defaults.json under the full path of the
 * command, root word included (`frodo journey list`), so `frodo settings defaults --clear` takes
 * that path. A path without the root word names nothing: the command prints "No saved defaults"
 * and exits with 1. This test reads every `frodo settings defaults --clear '<path>'` example of
 * the guide, saves a default under that path in a scratch home, runs the exact command with the
 * built `frodo`, and expects exit 0, the key removed and the other keys kept.
 *
 * No tenant, no secrets, no terminal. Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const migration = fs
  .readFileSync(
    fileURLToPath(new URL('../../MIGRATION.md', import.meta.url)),
    'utf8'
  )
  // a command may wrap onto the next line of the guide
  .replace(/\s+/g, ' ');

/** The examples of the guide: the quoted path of every `frodo settings defaults --clear '<path>'`. */
const examples = [
  ...migration.matchAll(/`frodo settings defaults --clear '([^']+)'`/g),
].map((match) => match[1]);

/**
 * The examples that the guide is expected to hold. Dropping one fails the test; a new example is
 * checked by the same rules (the path starts with the root word, and the command runs).
 */
const EXPECTED_EXAMPLES = [
  'frodo config-manager pull all',
  'frodo agent ai list',
  'frodo <command path>',
];

suite('the saved-defaults commands of MIGRATION.md', () => {
  let home;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-migration-defaults-'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  /** Runs `frodo settings defaults <args>` with the scratch home, and gives the exit code and the output. */
  const frodoDefaults = (args) =>
    cp.spawnSync(binaryPath, ['settings', 'defaults', ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        FRODO_TEST: '',
        FRODO_NO_PROMPT: '1',
        FRODO_NO_UPDATE_CHECK: '1',
        NODE_OPTIONS: '',
        NO_COLOR: '1',
      },
    });

  const storeFile = () => path.join(home, '.frodo', 'Defaults.json');
  const writeStore = (keys) => {
    fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
    fs.writeFileSync(
      storeFile(),
      JSON.stringify(
        Object.fromEntries(keys.map((key) => [key, { realm: 'alpha' }]))
      )
    );
  };
  const readStore = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'));

  it('finds the examples of the guide, so the checks below cannot run over nothing', () => {
    expect(examples).toEqual(expect.arrayContaining(EXPECTED_EXAMPLES));
  });

  it.each(examples)(
    "the path of the example '%s' starts with the root word: the keys of the store carry it",
    (key) => {
      expect(key).toMatch(/^frodo /);
    }
  );

  it.each(examples)(
    "frodo settings defaults --clear '%s' exits 0 and removes the key it names",
    (key) => {
      writeStore([key, 'frodo journey list']);

      const result = frodoDefaults(['--clear', key]);

      expect({
        code: result.status,
        out: result.stdout + result.stderr,
      }).toEqual({
        code: 0,
        out: expect.stringContaining(`Cleared saved defaults for '${key}'.`),
      });
      expect(Object.keys(readStore())).toEqual(['frodo journey list']);
    },
    60000
  );

  describe('the example of the help of --clear', () => {
    /** The example that `frodo settings defaults -h` gives: the quoted path after `e.g.`, whatever the wrapping of the help. */
    const exampleOfHelp = () => {
      const help = frodoDefaults(['-h']);
      expect(help.status).toBe(0);
      const found = (help.stdout + help.stderr)
        .replace(/\s+/g, ' ')
        .match(/e\.g\. "([^"]+)"/);
      expect(found).not.toBeNull();
      return found[1];
    };

    it('starts with the root word, as the keys of the store do', () => {
      expect(exampleOfHelp()).toMatch(/^frodo /);
    });

    it('is the full path of a command that exists', () => {
      const [root, ...path] = exampleOfHelp().split(' ');

      const result = cp.spawnSync(binaryPath, [...path, '-h'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FRODO_TEST: '',
          FRODO_NO_PROMPT: '1',
          FRODO_NO_UPDATE_CHECK: '1',
          NODE_OPTIONS: '',
          NO_COLOR: '1',
        },
      });

      expect(root).toBe('frodo');
      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).toContain(
        `Usage: ${exampleOfHelp()}`
      );
    });

    it('as it is typed, clears what a save of that command wrote, and nothing else', () => {
      const key = exampleOfHelp();
      writeStore([key, 'frodo agent ai list']);

      const result = frodoDefaults(['--clear', key]);

      expect({
        code: result.status,
        out: result.stdout + result.stderr,
      }).toEqual({
        code: 0,
        out: expect.stringContaining(`Cleared saved defaults for '${key}'.`),
      });
      expect(Object.keys(readStore())).toEqual(['frodo agent ai list']);
    }, 60000);
  });

  it('the path of an example without the root word names nothing: the key carries it', () => {
    writeStore(['frodo config-manager pull all']);

    const result = frodoDefaults(['--clear', 'config-manager pull all']);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "No saved defaults for 'config-manager pull all'."
    );
    expect(Object.keys(readStore())).toEqual(['frodo config-manager pull all']);
  });
});
