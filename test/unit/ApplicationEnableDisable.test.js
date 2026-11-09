import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * `app enable`, `app disable` and the status column of `app list -l` (frodo-cli#1153).
 * The status of an application is the state of its connector, and only a
 * provisioning application has one. The ops functions call the library and turn
 * the result into the message and the answer the command exits with:
 * - enabling waits for the connector to answer its connection test; an
 *   application that is enabled but whose connector does not answer in time is a
 *   failure (exit 1) that says the connector is switched on;
 * - an application that already is in the requested state says so and succeeds;
 * - an application without a connector, an unknown application and a connector
 *   configuration that does not exist are errors the library throws, and fail;
 * - `--timeout` is seconds on the command line and milliseconds in the library
 *   (core record 0020), and without it no timeout is passed.
 * The library is a set of spies: the real one cannot load under jest's ESM
 * runtime.
 */

const app = {
  readApplications: jest.fn(),
  readApplicationStatuses: jest.fn(),
  enableApplication: jest.fn(),
  enableApplicationByName: jest.fn(),
  disableApplication: jest.fn(),
  disableApplicationByName: jest.fn(),
};
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    app,
    utils: {
      getTypedFilename: jest.fn(),
      titleCase: jest.fn(),
      getFilePath: jest.fn(),
      getWorkingDirectory: jest.fn(),
      saveJsonToFile: jest.fn(),
    },
  },
  state: {},
}));

const printError = jest.fn();
const printMessage = jest.fn();
const stopProgressIndicator = jest.fn();
const created = [];
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError,
  printMessage,
  createProgressIndicator: jest.fn((type, total, message) => {
    created.push(message);
    return 'spinner';
  }),
  stopProgressIndicator,
  updateProgressIndicator: jest.fn(),
  debugMessage: jest.fn(),
  createTable: jest.fn((header) => {
    const table = { header, rows: [] };
    table.push = (row) => table.rows.push(row);
    table.toString = () => 'TABLE';
    tables.push(table);
    return table;
  }),
}));
const tables = [];
jest.unstable_mockModule('../../src/utils/ImportItems', () => ({
  importItemsOfFile: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/OperationRun', () => ({
  OperationRun: class {},
}));
jest.unstable_mockModule('../../src/ops/utils/Wordwrap', () => ({
  default: (text) => text,
}));

const { enableApplication, disableApplication, listApplications } =
  await import('../../src/ops/ApplicationOps');

const ID = '9c1101aa-0000-4000-8000-0000000011a1';
const NAME = 'ZionDirectory';
const result = (more = {}) => ({
  applicationId: ID,
  applicationName: NAME,
  connectorId: NAME,
  status: 'active',
  changed: true,
  ...more,
});
const lastStop = () => stopProgressIndicator.mock.calls.at(-1);

beforeEach(() => {
  jest.clearAllMocks();
  created.length = 0;
  tables.length = 0;
});
afterEach(() => jest.clearAllMocks());

describe('enableApplication', () => {
  test('by id: the library gets the id and, without --timeout, no options at all', async () => {
    app.enableApplication.mockResolvedValue(result({ ready: true }));

    await expect(enableApplication(ID, undefined)).resolves.toBe(true);

    expect(app.enableApplication).toHaveBeenCalledTimes(1);
    expect(app.enableApplication.mock.calls[0]).toEqual([ID]);
    expect(app.enableApplicationByName).not.toHaveBeenCalled();
  });

  test('by name: the library gets the name', async () => {
    app.enableApplicationByName.mockResolvedValue(result({ ready: true }));

    await expect(enableApplication(undefined, NAME)).resolves.toBe(true);

    expect(app.enableApplicationByName.mock.calls[0]).toEqual([NAME]);
    expect(app.enableApplication).not.toHaveBeenCalled();
  });

  test.each([
    [90, 90000],
    [1.5, 1500],
    [0, 0],
  ])(
    '--timeout %s seconds is %s milliseconds in the library',
    async (seconds, ms) => {
      app.enableApplicationByName.mockResolvedValue(result({ ready: true }));

      await enableApplication(undefined, NAME, seconds);

      expect(app.enableApplicationByName.mock.calls[0]).toEqual([
        NAME,
        { timeout: ms },
      ]);
    }
  );

  test('--timeout also reaches the by-id call', async () => {
    app.enableApplication.mockResolvedValue(result({ ready: true }));

    await enableApplication(ID, undefined, 20);

    expect(app.enableApplication.mock.calls[0]).toEqual([
      ID,
      { timeout: 20000 },
    ]);
  });

  test('a changed application whose connector answers: success', async () => {
    app.enableApplicationByName.mockResolvedValue(
      result({ changed: true, ready: true })
    );

    await expect(enableApplication(undefined, NAME)).resolves.toBe(true);

    expect(lastStop()).toEqual(['spinner', `Enabled ${NAME}`, 'success']);
    expect(printError).not.toHaveBeenCalled();
  });

  test('an application that is active already says so and succeeds', async () => {
    app.enableApplicationByName.mockResolvedValue(
      result({ changed: false, ready: true })
    );

    await expect(enableApplication(undefined, NAME)).resolves.toBe(true);

    expect(lastStop()).toEqual([
      'spinner',
      `${NAME} is active already`,
      'success',
    ]);
  });

  test('enabled but the connector does not answer in time: failure that says the connector is on and gives the last answer', async () => {
    app.enableApplicationByName.mockResolvedValue(
      result({ ready: false, error: 'connector not available' })
    );

    await expect(enableApplication(undefined, NAME)).resolves.toBe(false);

    expect(lastStop()[2]).toBe('fail');
    const [message, level] = printMessage.mock.calls.at(-1);
    expect(level).toBe('error');
    expect(message).toContain(`connector ${NAME}`);
    expect(message).toContain('is enabled');
    expect(message).toContain('connector not available');
    expect(message).toContain('--timeout');
  });

  test('an application that was active already but whose connector does not answer is a failure too', async () => {
    app.enableApplicationByName.mockResolvedValue(
      result({ changed: false, ready: false })
    );

    await expect(enableApplication(undefined, NAME)).resolves.toBe(false);
  });

  test.each([
    [
      'an application without a connector',
      "application 'ZionDirectory' has no connector, so it has no status to change",
    ],
    ['an unknown application', 'Error reading application Nebuchadnezzar'],
    [
      'a connector configuration that does not exist',
      'Error enabling connector ZionDirectory',
    ],
  ])('%s: the error is printed and the command fails', async (_, text) => {
    const error = new Error(text);
    app.enableApplicationByName.mockRejectedValue(error);

    await expect(enableApplication(undefined, NAME)).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(error);
    expect(lastStop()).toEqual(['spinner', `Error enabling ${NAME}`, 'fail']);
  });
});

describe('disableApplication', () => {
  test('by id and by name; there is nothing to wait for, so no options', async () => {
    app.disableApplication.mockResolvedValue(result({ status: 'inactive' }));
    app.disableApplicationByName.mockResolvedValue(
      result({ status: 'inactive' })
    );

    await expect(disableApplication(ID, undefined)).resolves.toBe(true);
    await expect(disableApplication(undefined, NAME)).resolves.toBe(true);

    expect(app.disableApplication.mock.calls[0]).toEqual([ID]);
    expect(app.disableApplicationByName.mock.calls[0]).toEqual([NAME]);
  });

  test('a changed application: success', async () => {
    app.disableApplicationByName.mockResolvedValue(
      result({ status: 'inactive', changed: true })
    );

    await expect(disableApplication(undefined, NAME)).resolves.toBe(true);

    expect(lastStop()).toEqual(['spinner', `Disabled ${NAME}`, 'success']);
  });

  test('an application that is inactive already says so and succeeds', async () => {
    app.disableApplicationByName.mockResolvedValue(
      result({ status: 'inactive', changed: false })
    );

    await expect(disableApplication(undefined, NAME)).resolves.toBe(true);

    expect(lastStop()).toEqual([
      'spinner',
      `${NAME} is inactive already`,
      'success',
    ]);
  });

  test.each([
    'application without a connector',
    'unknown application',
    'missing connector configuration',
  ])('%s: the error is printed and the command fails', async (text) => {
    const error = new Error(text);
    app.disableApplicationByName.mockRejectedValue(error);

    await expect(disableApplication(undefined, NAME)).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(error);
    expect(lastStop()).toEqual(['spinner', `Error disabling ${NAME}`, 'fail']);
  });
});

describe('app list -l: the status column', () => {
  const apps = [
    {
      _id: 'b',
      name: 'Bookmark',
      templateName: 'bookmark',
      templateVersion: '1.0',
      description: '',
    },
    {
      _id: ID,
      name: NAME,
      templateName: 'azure.ad',
      templateVersion: '3.3',
      description: '',
    },
    {
      _id: 'c',
      name: 'Cold',
      templateName: 'csv.multifile',
      templateVersion: '1.0',
      description: '',
    },
  ];
  beforeEach(() => {
    app.readApplications.mockResolvedValue(apps.map((a) => ({ ...a })));
  });

  test('plain list: one name per line, and the status is not read', async () => {
    await expect(listApplications(false)).resolves.toBe(true);

    expect(app.readApplicationStatuses).not.toHaveBeenCalled();
    expect(tables).toHaveLength(0);
    expect(printMessage.mock.calls.map(([text]) => text)).toEqual([
      'Bookmark',
      'Cold',
      NAME,
    ]);
  });

  test('long list: a Status column before the description, Active, Inactive, or nothing, from one read', async () => {
    app.readApplicationStatuses.mockResolvedValue([
      { applicationId: 'b', applicationName: 'Bookmark', status: 'none' },
      { applicationId: ID, applicationName: NAME, status: 'active' },
      { applicationId: 'c', applicationName: 'Cold', status: 'inactive' },
    ]);

    await expect(listApplications(true)).resolves.toBe(true);

    expect(app.readApplicationStatuses).toHaveBeenCalledTimes(1);
    const [table] = tables;
    const header = table.header.map((h) =>
      typeof h === 'string' ? h : h.content
    );
    expect(header).toEqual([
      'Name',
      'Id',
      'Template',
      'Version',
      'Authoritative',
      'Status',
      'Description',
    ]);
    const statusOf = (name) => table.rows.find((r) => r[0] === name)[5];
    expect(statusOf('Bookmark')).toBe('');
    expect(statusOf(NAME)).toBe('Active');
    expect(statusOf('Cold')).toBe('Inactive');
  });

  test('an application that has no entry among the statuses shows nothing', async () => {
    app.readApplicationStatuses.mockResolvedValue([]);

    await expect(listApplications(true)).resolves.toBe(true);

    expect(tables[0].rows.every((r) => r[5] === '')).toBe(true);
  });

  test('a failure to read the statuses does not fail the list: it is printed as it always was, without the column, and a warning says why', async () => {
    app.readApplicationStatuses.mockRejectedValue(
      new Error('cannot read the connectors')
    );

    await expect(listApplications(true)).resolves.toBe(true);

    expect(printError).not.toHaveBeenCalled();
    const header = tables[0].header.map((h) =>
      typeof h === 'string' ? h : h.content
    );
    expect(header).toEqual([
      'Name',
      'Id',
      'Template',
      'Version',
      'Authoritative',
      'Description',
    ]);
    expect(tables[0].rows.every((r) => r.length === header.length)).toBe(true);
    const warnings = printMessage.mock.calls.filter(
      ([, level]) => level === 'warn'
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0][0]).toContain('cannot read the connectors');
    expect(warnings[0][0]).toContain('Status column is left out');
  });

  test('a failure to read the applications still fails the command', async () => {
    const error = new Error('cannot read the applications');
    app.readApplications.mockRejectedValue(error);

    await expect(listApplications(true)).resolves.toBe(false);

    expect(printError).toHaveBeenCalledWith(error);
    expect(app.readApplicationStatuses).not.toHaveBeenCalled();
  });
});
