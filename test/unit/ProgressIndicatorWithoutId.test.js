import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

// frodo-lib stops a progress indicator in a catch block also when the operation
// failed before it created one (the id is declared and assigned later), so it
// passes an id it never got. That is nothing to warn about: "Progress indicator
// undefined not found." showed on a tenant that does not allow reading telemetry,
// in the middle of every listing that exports the whole configuration.

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

const {
  createProgressIndicator,
  stopProgressIndicator,
  updateProgressIndicator,
} = await import('../../src/utils/Console.ts');

let errorOutput;

beforeEach(() => {
  errorOutput = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorOutput.mockRestore();
});

const warnings = () =>
  errorOutput.mock.calls.filter(([text]) => /not found/.test(String(text)));

describe('a progress indicator that was never created', () => {
  test('stopping it with an undefined id warns about nothing', () => {
    stopProgressIndicator(
      undefined,
      'Error exporting telemetry exporters',
      'fail'
    );

    expect(warnings()).toEqual([]);
  });

  test('updating it with an undefined id warns about nothing', () => {
    updateProgressIndicator(undefined, 'Exporting telemetry exporter x');

    expect(warnings()).toEqual([]);
  });

  test('a null id is the same', () => {
    stopProgressIndicator(null);
    updateProgressIndicator(null);

    expect(warnings()).toEqual([]);
  });

  test('an id that was given and is not known is still a warning, because that is a bug', () => {
    stopProgressIndicator('no-such-indicator');
    updateProgressIndicator('no-such-indicator');

    expect(warnings()).toHaveLength(2);
    expect(String(warnings()[0][0])).toContain(
      'Progress indicator no-such-indicator not found.'
    );
  });

  test('an indicator that exists is stopped as before, once', () => {
    const id = createProgressIndicator('indeterminate', 0, 'Working');

    stopProgressIndicator(id, 'Done', 'success');
    stopProgressIndicator(id);

    expect(warnings()).toHaveLength(1);
  });
});
