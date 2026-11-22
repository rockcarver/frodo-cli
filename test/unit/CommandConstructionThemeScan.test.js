import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

const { FrodoCommand, FrodoStubCommand } =
  await import('../../src/cli/FrodoCommand.ts');

/**
 * Building a command object touches no file of the config folder.
 *
 * `app.ts` builds the whole command tree (about 490 command objects) before it
 * parses the command line. When the constructor of `FrodoStubCommand` applied
 * the saved colour theme, every one of them checked the theme folder
 * (`mkdirSync`, `readdirSync`, 12 `existsSync`, 12 `statSync`) and `Theme.json`
 * (3 `statSync`): 14,282 synchronous calls and about 50 ms of every start,
 * for a theme that `app.ts` has applied once, before it builds the tree.
 * `StartupThemeFiles.test.js` pins the same fact for a whole start; this one
 * pins the place where it was decided.
 */
describe('constructing commands does not scan the colour theme files', () => {
  let root;
  let configPath;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-theme-scan-'));
    // A folder that does not exist yet: anything that creates, lists, reads or
    // checks something below it is a theme (or other config) access.
    configPath = path.join(root, 'not-created-yet');
    process.env.FRODO_CONFIG_PATH = configPath;
  });

  afterEach(() => {
    delete process.env.FRODO_CONFIG_PATH;
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('touches nothing below the config folder for 50 stub commands and 50 commands', () => {
    const touched = [];
    for (const fn of [
      'readdirSync',
      'statSync',
      'existsSync',
      'mkdirSync',
      'readFileSync',
      'writeFileSync',
    ]) {
      const original = fs[fn];
      jest.spyOn(fs, fn).mockImplementation((...args) => {
        if (String(args[0]).startsWith(configPath)) {
          touched.push(`${fn} ${args[0]}`);
        }
        return original(...args);
      });
    }

    for (let i = 0; i < 50; i++) new FrodoStubCommand(`stub${i}`);
    for (let i = 0; i < 50; i++) new FrodoCommand(`leaf${i}`, []);

    expect(touched).toEqual([]);
    expect(fs.existsSync(configPath)).toBe(false);
  });
});
