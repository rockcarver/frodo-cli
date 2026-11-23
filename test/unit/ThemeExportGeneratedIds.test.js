import { beforeEach, describe, expect, jest, test } from '@jest/globals';

// A theme that a tenant returns without an `_id` gets one when it is exported,
// so that it can be keyed in the export file. The id is a random (version 4)
// UUID made by Node itself (crypto.randomUUID). A theme that has an id keeps it.

const readThemeByName = jest.fn();
const readThemes = jest.fn();
const saveToFile = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    theme: { readThemeByName, readThemes },
    utils: {
      getRealmString: () => 'alpha',
      getTypedFilename: (name, type) => `${name}.${type}.json`,
      saveJsonToFile: jest.fn(),
      saveToFile,
      getFilePath: (file) => file,
      getWorkingDirectory: () => '.',
    },
  },
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractDataToFile: jest.fn(),
  getExtractedData: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createProgressIndicator: jest.fn(() => 'indicator'),
  createTable: jest.fn(),
  printError: jest.fn(),
  printMessage: jest.fn(),
  stopProgressIndicator: jest.fn(),
  updateProgressIndicator: jest.fn(),
}));

const { exportThemeByName, exportThemesToFiles } =
  await import('../../src/ops/ThemeOps.ts');

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The themes that saveToFile was asked to write, one flat list. */
const savedThemes = () => saveToFile.mock.calls.flatMap(([, data]) => data);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('exportThemeByName', () => {
  test('gives a theme without an id a version 4 UUID', async () => {
    readThemeByName.mockResolvedValue({ name: 'Starter Theme' });

    expect(await exportThemeByName('Starter Theme', null, true, false)).toBe(
      true
    );

    const [theme] = savedThemes();
    expect(theme.name).toBe('Starter Theme');
    expect(theme._id).toMatch(UUID_V4);
  });

  test('gives two themes without an id two different ids', async () => {
    readThemeByName.mockResolvedValueOnce({ name: 'One' });
    readThemeByName.mockResolvedValueOnce({ name: 'Two' });

    await exportThemeByName('One', null, true, false);
    await exportThemeByName('Two', null, true, false);

    const [first, second] = savedThemes();
    expect(second._id).not.toBe(first._id);
  });

  test('keeps the id of a theme that has one', async () => {
    readThemeByName.mockResolvedValue({
      _id: '11111111-2222-4333-8444-555555555555',
      name: 'Starter Theme',
    });

    await exportThemeByName('Starter Theme', null, true, false);

    expect(savedThemes()[0]._id).toBe('11111111-2222-4333-8444-555555555555');
  });
});

describe('exportThemesToFiles', () => {
  test('gives every theme without an id its own version 4 UUID and keeps the others', async () => {
    readThemes.mockResolvedValue([
      { name: 'One' },
      { _id: 'kept-id', name: 'Two' },
      { name: 'Three' },
    ]);

    expect(await exportThemesToFiles(true, false)).toBe(true);

    const [one, two, three] = savedThemes();
    expect(one._id).toMatch(UUID_V4);
    expect(two._id).toBe('kept-id');
    expect(three._id).toMatch(UUID_V4);
    expect(three._id).not.toBe(one._id);
  });
});
