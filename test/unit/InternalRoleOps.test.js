import fs from 'fs';
import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

let workingDirectory;
const importInternalRoles = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    utils: {
      getWorkingDirectory: () => workingDirectory,
      getFilePath: (file) => path.join(workingDirectory, file),
    },
    role: { importInternalRoles },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  createProgressIndicator: jest.fn(),
  createTable: jest.fn(),
  debugMessage: jest.fn(),
  printError,
  printMessage,
  stopProgressIndicator: jest.fn(),
  updateProgressIndicator: jest.fn(),
}));

const { importInternalRolesFromFiles } =
  await import('../../src/ops/InternalRoleOps');

describe('importInternalRolesFromFiles', () => {
  beforeEach(() => {
    workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-role-'));
    jest.resetAllMocks();
    importInternalRoles.mockResolvedValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(workingDirectory, { recursive: true, force: true });
  });

  test('imports all matching files case-insensitively and ignores unrelated files', async () => {
    const filenames = [
      'exported.internalRole.json',
      'lower.internalrole.json',
      'upper.INTERNALROLE.JSON',
    ];
    const exports = filenames.map((name) => ({
      internalRole: { [name]: { _id: name, name } },
    }));
    filenames.forEach((name, index) => {
      fs.writeFileSync(
        path.join(workingDirectory, name),
        JSON.stringify(exports[index])
      );
    });
    for (const name of ['other.json', 'role.internalRole.json.bak']) {
      fs.writeFileSync(path.join(workingDirectory, name), 'not json');
    }

    await expect(importInternalRolesFromFiles()).resolves.toBe(true);

    expect(importInternalRoles).toHaveBeenCalledTimes(filenames.length);
    for (const data of exports) {
      expect(importInternalRoles).toHaveBeenCalledWith(data);
    }
    expect(printError).not.toHaveBeenCalled();
    expect(printMessage).not.toHaveBeenCalled();
  });

  test.each([
    { filenames: [] },
    { filenames: ['other.json', 'role.internalRole.json.bak'] },
  ])(
    'reports failure when no matching files exist (%j)',
    async ({ filenames }) => {
      for (const name of filenames) {
        fs.writeFileSync(path.join(workingDirectory, name), '{}');
      }

      await expect(importInternalRolesFromFiles()).resolves.toBe(false);

      expect(importInternalRoles).not.toHaveBeenCalled();
      expect(printMessage).toHaveBeenCalledWith(
        'No internal role files found to import.',
        'error'
      );
    }
  );

  test('reports a failed file and continues importing remaining files', async () => {
    const data = { internalRole: { valid: { _id: 'valid', name: 'valid' } } };
    fs.writeFileSync(
      path.join(workingDirectory, 'a-broken.internalRole.json'),
      'not json'
    );
    fs.writeFileSync(
      path.join(workingDirectory, 'b-valid.internalRole.json'),
      JSON.stringify(data)
    );

    await expect(importInternalRolesFromFiles()).resolves.toBe(false);

    expect(importInternalRoles).toHaveBeenCalledWith(data);
    expect(printError).toHaveBeenCalledWith(
      expect.any(Error),
      'Error importing internal roles from files'
    );
  });
});
