import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { state } from '@rockcarver/frodo-lib';
import { existScript } from '../../src/utils/FrConfig.ts';

/**
 * `existScript` says whether the config folder that a command works on already holds the script
 * config of a script, which a pull of journeys uses to leave a script that is there alone. The
 * config folder is the one that the directory option names (the state of the library), and only
 * when there is none the current directory: a `realms` folder that happens to be in the current
 * directory is not the config folder of a command that was given another one. Nothing is replaced
 * here: the function, the library's `getFilePath` and its search for a file are the real ones.
 */

const CONFIG = 'realms/alpha/scripts/scripts-config';

let root;
let configFolder;
let elsewhere;
let directoryBefore;
let cwdBefore;

/** A file below a folder, with the folders on the way. */
function put(folder, relative) {
  const target = path.join(folder, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '{}');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-exist-script-'));
  configFolder = path.join(root, 'config');
  elsewhere = path.join(root, 'elsewhere');
  fs.mkdirSync(configFolder);
  fs.mkdirSync(elsewhere);
  directoryBefore = state.getDirectory();
  cwdBefore = process.cwd();
  // the current directory is not the config folder, as when the command is given the directory option
  process.chdir(elsewhere);
  state.setDirectory(configFolder);
});

afterEach(() => {
  process.chdir(cwdBefore);
  state.setDirectory(directoryBefore);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('existScript', () => {
  test('finds a script config in the config folder that the directory option names', () => {
    put(configFolder, `${CONFIG}/S1.json`);

    expect(existScript('S1', 'alpha')).toBe(true);
  });

  test('does not find a script config that is only in the current directory', () => {
    put(elsewhere, `${CONFIG}/Stale.json`);
    fs.mkdirSync(path.join(configFolder, CONFIG), { recursive: true });

    expect(existScript('Stale', 'alpha')).toBe(false);
  });

  test('does not find a script that the config folder lacks, or a config folder with no scripts', () => {
    expect(existScript('S1', 'alpha')).toBe(false);

    put(configFolder, `${CONFIG}/Other.json`);

    expect(existScript('S1', 'alpha')).toBe(false);
  });

  test('looks in the realm that it is asked for', () => {
    put(configFolder, `${CONFIG}/S1.json`);

    expect(existScript('S1', 'bravo')).toBe(false);
    expect(existScript('S1', 'root')).toBe(false);
  });

  test('finds a script config in a folder below scripts-config', () => {
    put(configFolder, `${CONFIG}/sub/S2.json`);

    expect(existScript('S2', 'alpha')).toBe(true);
  });

  test('without a directory option the config folder is the current directory', () => {
    state.setDirectory(undefined);
    put(elsewhere, `${CONFIG}/S3.json`);

    expect(existScript('S3', 'alpha')).toBe(true);
    expect(existScript('S4', 'alpha')).toBe(false);
  });
});
