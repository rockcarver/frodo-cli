import { jest } from '@jest/globals';

// `journey list -l` shows fields of the tree itself. The list of journeys holds
// all of them, so the table is built from it and no journey is exported: an
// export reads every node of the journey and fails for a journey that names a
// node the tenant does not have, which used to take the whole table down.

const readJourneys = jest.fn();
const exportJourney = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: class FrodoError extends Error {},
  frodo: {
    authn: { journey: { readJourneys, exportJourney }, node: {} },
    utils: {},
  },
  state: { getVerbose: () => false },
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: {
    heading: (text) => text,
    negative: (text) => `-${text}`,
    positive: (text) => `+${text}`,
    warning: (text) => `!${text}`,
  },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createProgressIndicator: jest.fn(() => 'progress'),
  createTable: () => {
    const rows = [];
    rows.toString = () => JSON.stringify(rows);
    return rows;
  },
  debugMessage: jest.fn(),
  printError,
  printMessage,
  stopProgressIndicator: jest.fn(),
  updateProgressIndicator: jest.fn(),
  verboseMessage: jest.fn(),
}));
for (const modulePath of [
  '../../src/ops/CirclesOfTrustOps',
  '../../src/ops/EmailTemplateOps',
  '../../src/ops/IdpOps',
  '../../src/ops/NodeOps',
  '../../src/ops/Saml2Ops',
  '../../src/ops/ScriptOps',
  '../../src/ops/ThemeOps',
]) {
  jest.unstable_mockModule(modulePath, () => ({}));
}
jest.unstable_mockModule('../../src/ops/utils/OpsUtils', () => ({
  errorHandler: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/utils/Wordwrap', () => ({
  default: (text) => text,
}));

const { listJourneys } = await import('../../src/ops/JourneyOps');

const trees = [
  {
    _id: 'Login',
    enabled: true,
    innerTreeOnly: false,
    mustRun: false,
    noSession: false,
    transactionalOnly: false,
    identityResource: 'managed/alpha_user',
    uiConfig: { categories: '["Authentication","Mfa"]' },
  },
  {
    _id: 'Inner',
    enabled: false,
    innerTreeOnly: true,
    mustRun: true,
    noSession: true,
    transactionalOnly: true,
    uiConfig: { categories: '[]' },
  },
  { _id: 'Bare' },
];

const tableRows = () =>
  JSON.parse(printMessage.mock.calls.find(([, type]) => type === 'data')[0]);

beforeEach(() => {
  jest.resetAllMocks();
  readJourneys.mockResolvedValue(trees);
});

describe('listJourneys', () => {
  test('lists the names', async () => {
    await expect(listJourneys()).resolves.toBe(true);

    expect(printMessage.mock.calls).toEqual([
      ['Login', 'data'],
      ['Inner', 'data'],
      ['Bare', 'data'],
    ]);
  });

  test('the long version is a table of the fields of the trees, from the list alone', async () => {
    await expect(listJourneys(true)).resolves.toBe(true);

    expect(exportJourney).not.toHaveBeenCalled();
    expect(readJourneys).toHaveBeenCalledTimes(1);
    expect(tableRows()).toEqual([
      [
        'Login',
        '+enabled',
        '+no',
        '+no',
        '+no',
        '+no',
        'managed/alpha_user',
        'Authentication, Mfa',
      ],
      ['Inner', '-disabled', '!yes', '!yes', '!yes', '!yes', '', ''],
      ['Bare', '+enabled', '+no', '+no', '+no', '+no', '', ''],
    ]);
  });

  test('a journey that cannot be exported does not matter, because none is exported', async () => {
    exportJourney.mockRejectedValue(new Error('Error exporting journey Inner'));

    await expect(listJourneys(true)).resolves.toBe(true);

    expect(printError).not.toHaveBeenCalled();
    expect(tableRows()).toHaveLength(3);
  });

  test('a list that cannot be read is an error, in both versions', async () => {
    readJourneys.mockRejectedValue(new Error('Error reading journeys'));

    await expect(listJourneys(true)).resolves.toBe(false);
    await expect(listJourneys()).resolves.toBe(false);

    expect(printError).toHaveBeenCalledTimes(2);
  });
});
