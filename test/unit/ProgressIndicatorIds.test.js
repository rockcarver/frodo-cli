import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

// The id of a progress indicator is a random (version 4) UUID, made by Node
// itself (crypto.randomUUID) and not by a package. Two indicators never share
// an id: the id is the key of the table of running indicators, so a repeated
// id would make one indicator replace another.

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: { utils: {} },
  FrodoError: class FrodoError extends Error {},
  state: {
    getVerbose: () => false,
    getDebug: () => false,
    getCurlirize: () => false,
  },
}));

// every colour is the text itself
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));

const { createProgressIndicator, stopProgressIndicator } =
  await import('../../src/utils/Console.ts');

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let errorOutput;

beforeEach(() => {
  errorOutput = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorOutput.mockRestore();
});

describe('the id of a progress indicator', () => {
  test('is a version 4 UUID', () => {
    const id = createProgressIndicator('determinate', 1, 'Exporting');
    try {
      expect(id).toMatch(UUID_V4);
    } finally {
      stopProgressIndicator(id);
    }
  });

  test('is different for every indicator that is running at the same time', () => {
    const ids = Array.from({ length: 200 }, () =>
      createProgressIndicator('indeterminate', 0, 'Working')
    );
    try {
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(UUID_V4);
    } finally {
      ids.forEach((id) => stopProgressIndicator(id));
    }
  });

  test('is different when an indicator is created again after the last one stopped', () => {
    const first = createProgressIndicator('indeterminate', 0, 'One');
    stopProgressIndicator(first);
    const second = createProgressIndicator('indeterminate', 0, 'Two');
    stopProgressIndicator(second);
    expect(second).not.toBe(first);
  });

  test('is accepted again by stopProgressIndicator, which finds the indicator by it', () => {
    const id = createProgressIndicator('determinate', 1, 'Exporting');
    stopProgressIndicator(id, 'Done.', 'success');
    const notFound = errorOutput.mock.calls.filter(([text]) =>
      /not found/.test(String(text))
    );
    expect(notFound).toEqual([]);
  });
});
