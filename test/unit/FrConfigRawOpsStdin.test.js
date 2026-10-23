import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * How `config-manager push raw --stdin` hands the piped config to frodo-lib
 * (src/configManagerOps/FrConfigRawOps.ts, `configManagerImportRaw`). The
 * text is read by the shared stdin helper and goes through lib's
 * `readJsonFile`, which only takes a path or a descriptor, so it passes
 * through a short-lived private file. The real-CLI behaviour (a slow pipe,
 * placeholders, cleanup) is in ConfigManagerPushRawStdin.test.js; this
 * pins what that cannot see: the file's permissions while it exists, and its
 * removal when the parse fails.
 */
const state = { seen: undefined };
const readStdinToEndSync = jest.fn();
const readJsonFile = jest.fn();
const importRawConfig = jest.fn();
const printError = jest.fn();

class FrodoError extends Error {
  constructor(message, original) {
    super(message);
    this.original = original;
  }
}

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  frodo: {
    utils: {
      getFilePath: jest.fn(),
      saveJsonToFile: jest.fn(),
      readJsonFile,
      getWorkingDirectory: jest.fn(),
    },
    rawConfig: { exportRawConfig: jest.fn(), importRawConfig },
  },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createProgressIndicator: jest.fn(() => 'id'),
  printError,
  stopProgressIndicator: jest.fn(),
  verboseMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  clearOperationalAttributes: (obj) => {
    delete obj._id;
  },
}));
jest.unstable_mockModule('../../src/utils/StdinSync', () => ({
  readStdinToEndSync,
}));
const { configManagerImportRaw } =
  await import('../../src/configManagerOps/FrConfigRawOps.ts');

const posix = process.platform !== 'win32';

beforeEach(() => {
  state.seen = undefined;
  readStdinToEndSync.mockReset();
  readJsonFile.mockReset();
  importRawConfig.mockReset();
  printError.mockReset();
  readJsonFile.mockImplementation((file) => {
    const dir = path.dirname(file);
    state.seen = {
      file,
      dir,
      fileMode: fs.statSync(file).mode & 0o777,
      dirMode: fs.statSync(dir).mode & 0o777,
      text: fs.readFileSync(file, 'utf8'),
    };
    return JSON.parse(state.seen.text);
  });
});

describe('configManagerImportRaw --stdin', () => {
  it('reads stdin once through the helper and hands lib a private file with the piped text', async () => {
    readStdinToEndSync.mockReturnValue('{"_id":"x","value":1}');
    await expect(configManagerImportRaw('x/y', true)).resolves.toBe(true);
    expect(readStdinToEndSync).toHaveBeenCalledTimes(1);
    expect(readJsonFile).toHaveBeenCalledTimes(1);
    expect(state.seen.text).toBe('{"_id":"x","value":1}');
    expect(path.basename(state.seen.dir)).toMatch(/^frodo-stdin-/);
    expect(path.dirname(state.seen.dir)).toBe(os.tmpdir());
    // What was parsed is what gets imported (operational attributes cleared).
    expect(importRawConfig).toHaveBeenCalledWith({ path: 'x/y' }, { value: 1 });
  });

  (posix ? it : it.skip)(
    'keeps the file private while it exists: a 0700 directory, a 0600 file',
    async () => {
      readStdinToEndSync.mockReturnValue('{"value":1}');
      await configManagerImportRaw('x/y', true);
      expect(state.seen.dirMode).toBe(0o700);
      expect(state.seen.fileMode).toBe(0o600);
    }
  );

  it('removes the file and its directory afterwards', async () => {
    readStdinToEndSync.mockReturnValue('{"value":1}');
    await configManagerImportRaw('x/y', true);
    expect(fs.existsSync(state.seen.dir)).toBe(false);
  });

  it('removes them when the parse fails, and reports it as a stdin problem', async () => {
    readStdinToEndSync.mockReturnValue('not json');
    readJsonFile.mockImplementationOnce((file) => {
      state.seen = { dir: path.dirname(file) };
      throw new Error('Error parsing JSON');
    });
    await expect(configManagerImportRaw('x/y', true)).resolves.toBe(false);
    expect(fs.existsSync(state.seen.dir)).toBe(false);
    expect(importRawConfig).not.toHaveBeenCalled();
    const [error] = printError.mock.calls[0];
    expect(error).toBeInstanceOf(FrodoError);
    expect(error.message).toBe('Error reading JSON from stdin');
  });
});
