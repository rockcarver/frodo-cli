import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * `config-manager delete cors`: the operation behind the command
 * (`configManagerDeleteCors` in src/configManagerOps/FrConfigCorsOps.ts), with
 * the library replaced by a stub that keeps the named CORS configurations of the
 * global CORS service and the IDM CORS filter in memory. The run tracker, the
 * cause helper, the plain-name rule and the module under test are real.
 *
 * What it pins: the configurations are read the way `pull cors` reads them and
 * the LISTED id is what is deleted (the text that was typed never reaches a
 * request, and neither does a listed id that is not a plain name); a named
 * configuration that is not listed fails the command whatever `--allow-failures`
 * says; one that fails does not stop the others, the summary names each failed
 * operation, and `--allow-failures` keeps the exit at 0 for a failed delete but
 * not for a list that could not be read. `--deep` also resets the IDM CORS
 * filter: initParams and urlPatterns become the defaults, every other key stays,
 * it is written only if something differs, never deleted, skipped on a classic
 * deployment, and a part that fails is named while the other parts still run.
 * The CORS service entry is never written or deleted.
 *
 * The same operation against a real fake tenant is in
 * ConfigManagerDeleteCorsFakeTenant.test.js, the command line in
 * ConfigManagerDeleteCorsCommand.test.js.
 */

class FrodoError extends Error {
  constructor(message, originalErrors) {
    super(message);
    this.name = 'FrodoError';
    this.originalErrors = Array.isArray(originalErrors)
      ? originalErrors
      : originalErrors
        ? [originalErrors]
        : [];
  }
}

let deployment;
/** The named configurations of the global CORS service, as the library lists them. */
let store;
/** The IDM CORS filter, or undefined when the tenant has none. */
let idmFilter;
const exportService = jest.fn();
const deleteServiceNextDescendent = jest.fn();
const readConfigEntity = jest.fn();
const updateConfigEntity = jest.fn();
// what a delete of the entry or of the IDM filter would call: they must stay unused
const deleteFullService = jest.fn();
const deleteFullServices = jest.fn();
const importService = jest.fn();
const importServices = jest.fn();
const deleteConfigEntity = jest.fn();
const importConfigEntities = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  frodo: {
    service: {
      exportService,
      deleteServiceNextDescendent,
      deleteFullService,
      deleteFullServices,
      importService,
      importServices,
      getFullServices: jest.fn(),
    },
    idm: {
      config: {
        readConfigEntity,
        updateConfigEntity,
        deleteConfigEntity,
        importConfigEntities,
      },
    },
    utils: {
      constants: { CLASSIC_DEPLOYMENT_TYPE_KEY: 'classic' },
      getFilePath: jest.fn(),
      saveJsonToFile: jest.fn(),
      readJsonFile: jest.fn(),
    },
  },
  state: { getDeploymentType: () => deployment },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createProgressIndicator: jest.fn(),
  printError,
  printMessage,
  stopProgressIndicator: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ConfigTreePath', () => ({
  pulledFilePath: jest.fn(),
}));

const { configManagerDeleteCors, IDM_CORS_FILTER_DEFAULTS } =
  await import('../../src/configManagerOps/FrConfigCorsOps');

/** A configuration as the library lists it: an id and the type `configuration`. */
const configuration = (id, type = 'configuration') => ({
  _id: id,
  _type: { _id: type, name: 'Cors Configuration', collection: true },
  acceptedOrigins: ['https://app.example.com'],
});

/** The IDM CORS filter as a tenant answers it, with the parameters of the defaults unless a test changes them. */
const filter = (extra = {}) => ({
  _id: 'servletfilter/cors',
  initParams: { ...IDM_CORS_FILTER_DEFAULTS.initParams },
  urlPatterns: [...IDM_CORS_FILTER_DEFAULTS.urlPatterns],
  ...extra,
});

const notFound = () =>
  Object.assign(new Error('Not Found'), { httpStatus: 404 });

/** The messages that were printed, as one text. */
const output = () =>
  printMessage.mock.calls.map(([text]) => String(text)).join('\n');
/** The level of the first message that contains `text`. */
const levelOf = (text) =>
  printMessage.mock.calls.find(([message]) =>
    String(message).includes(text)
  )?.[1];
/** The summary of failed operations, or undefined. */
const summary = () =>
  printMessage.mock.calls.find(([text]) =>
    /^\d+ of \d+ CORS operations? failed/.test(String(text))
  );
/** What was deleted, in order. */
let deleted;
/** The ids that the stub of the delete was told to refuse. */
let refuse;
/** What the stub of the IDM read and write was told to fail with. */
let idmReadError;
let idmWriteError;

beforeEach(() => {
  jest.clearAllMocks();
  deployment = 'forgeops';
  deleted = [];
  refuse = new Map();
  idmReadError = undefined;
  idmWriteError = undefined;
  store = [
    configuration('cors'),
    configuration('test'),
    configuration('custom'),
  ];
  idmFilter = filter();
  exportService.mockReset().mockImplementation(async () => ({
    service: {
      CorsService: { _id: '', nextDescendents: structuredClone(store) },
    },
  }));
  deleteServiceNextDescendent
    .mockReset()
    .mockImplementation(async (service, id) => {
      if (refuse.has(id)) throw refuse.get(id);
      deleted.push(id);
      return { _id: id };
    });
  readConfigEntity.mockReset().mockImplementation(async () => {
    if (idmReadError) throw idmReadError;
    if (!idmFilter) throw notFound();
    return structuredClone(idmFilter);
  });
  updateConfigEntity.mockReset().mockImplementation(async (id, data) => {
    if (idmWriteError) throw idmWriteError;
    idmFilter = structuredClone(data);
    return data;
  });
});

/** Nothing that deletes the service entry, deletes the IDM filter or writes the entry may ever be called. */
const expectNoEntryWriteAndNoFilterDelete = () => {
  expect(deleteFullService).not.toHaveBeenCalled();
  expect(deleteFullServices).not.toHaveBeenCalled();
  expect(importService).not.toHaveBeenCalled();
  expect(importServices).not.toHaveBeenCalled();
  expect(deleteConfigEntity).not.toHaveBeenCalled();
  expect(importConfigEntities).not.toHaveBeenCalled();
};

describe('the library calls', () => {
  test('the configurations are read from the global service, and the one that is named is deleted by its listed id from the global service', async () => {
    expect(await configManagerDeleteCors('test')).toBe(true);

    expect(exportService.mock.calls).toEqual([['CorsService', true]]);
    expect(deleteServiceNextDescendent.mock.calls).toEqual([
      ['CorsService', 'test', true],
    ]);
    expect(deleted).toEqual(['test']);
    expect(output()).toContain('Deleted CORS configuration: test');
    expectNoEntryWriteAndNoFilterDelete();
  });

  test('without --deep the IDM filter is not even read', async () => {
    expect(await configManagerDeleteCors(undefined)).toBe(true);

    expect(readConfigEntity).not.toHaveBeenCalled();
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });

  test('a delete of all deletes every listed configuration, the default one included, and nothing else', async () => {
    expect(await configManagerDeleteCors()).toBe(true);

    expect(deleted).toEqual(['cors', 'test', 'custom']);
    expect(output()).toContain('Deleted CORS configuration: cors');
    expect(summary()).toBeUndefined();
    expectNoEntryWriteAndNoFilterDelete();
  });
});

describe('a named delete: the id is looked up in what the service lists', () => {
  test.each([
    'Test',
    'TEST',
    ' test',
    'test ',
    'te',
    'tes*',
    '../x',
    'a/b',
    'a#b',
    'test/..',
  ])(
    'the typed text %j is not a listed id: nothing is deleted, the command fails, also with -d and --allow-failures',
    async (typed) => {
      for (const [dryRun, allowFailures] of [
        [false, false],
        [true, false],
        [false, true],
        [true, true],
      ]) {
        printMessage.mockClear();
        expect(
          await configManagerDeleteCors(typed, dryRun, allowFailures)
        ).toBe(false);
        expect(output()).toContain('not found.');
        expect(levelOf('not found.')).toBe('error');
        expect(summary()).toBeUndefined();
      }
      expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
    }
  );

  test('the message names the typed id in quotes', async () => {
    await configManagerDeleteCors('NOPE');

    expect(output()).toContain("CORS configuration 'NOPE' not found.");
  });

  test('a blank id is refused and nothing is read: it is never "all"', async () => {
    for (const blank of ['', ' ', '   ', '\t']) {
      expect(await configManagerDeleteCors(blank)).toBe(false);
    }
    expect(output()).toContain(
      'The CORS configuration id must not be empty. To delete all CORS configurations, leave out the id.'
    );
    expect(exportService).not.toHaveBeenCalled();
    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
  });

  test('a dry run says what would be deleted and sends no delete', async () => {
    expect(await configManagerDeleteCors('cors', true)).toBe(true);

    expect(output()).toContain('Dry run: Deleting CORS configuration: cors');
    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
  });

  test.each([
    '../realms/root',
    'x/y',
    'a#b',
    'a?b',
    'a%2Fb',
    '.',
    '..',
    'a\\b',
    'a\u0007b',
  ])(
    'a listed id %j that is not a plain name is never deleted, even when it is typed exactly: exit 1, with -d and --allow-failures too, no request',
    async (id) => {
      store = [configuration('cors'), configuration(id)];
      for (const [dryRun, allowFailures] of [
        [false, false],
        [true, false],
        [false, true],
      ]) {
        printMessage.mockClear();
        expect(await configManagerDeleteCors(id, dryRun, allowFailures)).toBe(
          false
        );
        expect(output()).toContain('is not a plain name');
        expect(output()).toContain('no request was sent for it');
      }
      expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
    }
  );

  test('a listed configuration whose type is not a plain name is never deleted', async () => {
    store = [configuration('x', '../services'), configuration('cors')];

    expect(await configManagerDeleteCors('x')).toBe(false);
    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
    expect(output()).toContain(
      'is listed with a type or an id that is not a plain name'
    );
  });

  test('a listed configuration without a type is never deleted', async () => {
    store = [{ _id: 'x' }];

    expect(await configManagerDeleteCors('x')).toBe(false);
    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
  });

  test('a delete that fails exits 1 and names the cause, also with --allow-failures: a named delete is one operation of the summary', async () => {
    refuse.set('test', new Error('could not delete test'));

    expect(await configManagerDeleteCors('test')).toBe(false);
    expect(printError).toHaveBeenCalledTimes(1);
    expect(printError.mock.calls[0][1]).toBe(
      "Error deleting CORS configuration 'test'"
    );
    expect(summary()[0]).toBe(
      '1 of 1 CORS operation failed:\n  - CORS configuration test: could not delete test'
    );

    expect(await configManagerDeleteCors('test', false, true)).toBe(true);
  });
});

describe('a delete of all', () => {
  test('nothing listed is a warning and a success, and deletes nothing', async () => {
    store = [];

    expect(await configManagerDeleteCors()).toBe(true);

    expect(output()).toContain('No CORS configurations found to delete.');
    expect(levelOf('No CORS configurations found to delete.')).toBe('warn');
    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
    expect(summary()).toBeUndefined();
  });

  test('a dry run lists every configuration and sends no delete', async () => {
    expect(await configManagerDeleteCors(undefined, true)).toBe(true);

    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
    expect(output()).toBe(
      [
        'Dry run: Deleting CORS configuration: cors',
        'Dry run: Deleting CORS configuration: test',
        'Dry run: Deleting CORS configuration: custom',
      ].join('\n')
    );
  });

  test('a plan, which the command shows before a question, says plan and not dry run', async () => {
    expect(
      await configManagerDeleteCors(undefined, true, false, { plan: true })
    ).toBe(true);

    expect(output()).toContain('Plan: Deleting CORS configuration: cors');
    expect(output()).not.toContain('Dry run');
    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
  });

  test('one that fails does not stop the others: the summary names it with its cause, the exit is 1', async () => {
    refuse.set('test', new Error('could not delete test'));

    expect(await configManagerDeleteCors()).toBe(false);

    expect(deleted).toEqual(['cors', 'custom']);
    expect(deleteServiceNextDescendent).toHaveBeenCalledTimes(3);
    expect(printError).toHaveBeenCalledTimes(1);
    const [text, level] = summary();
    expect(level).toBe('error');
    expect(text).toBe(
      '1 of 3 CORS operations failed:\n  - CORS configuration test: could not delete test'
    );
  });

  test('--allow-failures keeps the exit at 0 for a failed delete and still prints the summary, as a warning', async () => {
    refuse.set('test', new Error('could not delete test'));

    expect(await configManagerDeleteCors(undefined, false, true)).toBe(true);

    expect(deleted).toEqual(['cors', 'custom']);
    const [text, level] = summary();
    expect(level).toBe('warn');
    expect(text).toContain('CORS configuration test: could not delete test');
    expect(text).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('every failed delete is named', async () => {
    refuse.set('cors', new Error('one'));
    refuse.set('custom', new Error('three'));

    expect(await configManagerDeleteCors()).toBe(false);

    expect(deleted).toEqual(['test']);
    expect(summary()[0]).toBe(
      [
        '2 of 3 CORS operations failed:',
        '  - CORS configuration cors: one',
        '  - CORS configuration custom: three',
      ].join('\n')
    );
  });

  test('a listed id that is not a plain name is never sent and counts as a failed operation; the others are deleted', async () => {
    store = [
      configuration('cors'),
      configuration('../realms/root'),
      configuration('a#b'),
      configuration('x/y'),
      configuration('custom'),
    ];

    expect(await configManagerDeleteCors()).toBe(false);

    expect(deleted).toEqual(['cors', 'custom']);
    expect(deleteServiceNextDescendent.mock.calls.map(([, id]) => id)).toEqual([
      'cors',
      'custom',
    ]);
    expect(summary()[0]).toContain('3 of 5 CORS operations failed');
    for (const id of ['../realms/root', 'a#b', 'x/y']) {
      expect(summary()[0]).toContain(`CORS configuration ${id}:`);
    }
    // the same with --allow-failures: the exit is 0 only for what a failed operation counts
    expect(await configManagerDeleteCors(undefined, false, true)).toBe(true);
  });

  test('a dry run says how a real run would end: a listed id that is not a plain name is a failure there too, and no request is sent', async () => {
    store = [configuration('cors'), configuration('a#b')];

    expect(await configManagerDeleteCors(undefined, true)).toBe(false);

    expect(output()).toContain('Dry run: Deleting CORS configuration: cors');
    expect(output()).not.toContain('Dry run: Deleting CORS configuration: a#b');
    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
  });

  test('a control character in a listed id is written out, never printed raw', async () => {
    store = [configuration('a\u001b[31mb')];

    await configManagerDeleteCors();

    expect(output()).not.toContain('\u001b');
    expect(output()).toContain('\\u001b');
  });

  test('a list that cannot be read fails the command whatever --allow-failures says, deletes nothing and prints the error once, with no summary', async () => {
    exportService.mockReset().mockRejectedValue(new Error('read failed'));

    expect(await configManagerDeleteCors(undefined, false, true)).toBe(false);
    expect(await configManagerDeleteCors('cors', false, true)).toBe(false);
    expect(await configManagerDeleteCors(undefined, true, true)).toBe(false);

    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
    expect(printError).toHaveBeenCalledTimes(3);
    expect(summary()).toBeUndefined();
  });
});

describe('--deep: the IDM CORS filter', () => {
  test('a filter with other values is read, written with the defaults and every other key kept, after the configurations were deleted', async () => {
    idmFilter = filter({
      filterClass: 'org.eclipse.jetty.ee10.servlets.CrossOriginFilter',
      note: 'kept',
      initParams: {
        ...IDM_CORS_FILTER_DEFAULTS.initParams,
        allowedOrigins: 'https://app.example.com',
        allowCredentials: true,
        extra: 'dropped',
      },
      urlPatterns: ['/openidm/*'],
    });

    expect(
      await configManagerDeleteCors(undefined, false, false, { deep: true })
    ).toBe(true);

    expect(deleted).toEqual(['cors', 'test', 'custom']);
    expect(readConfigEntity.mock.calls).toEqual([['servletfilter/cors']]);
    expect(updateConfigEntity).toHaveBeenCalledTimes(1);
    expect(updateConfigEntity.mock.calls[0][0]).toBe('servletfilter/cors');
    expect(updateConfigEntity.mock.calls[0][1]).toEqual({
      _id: 'servletfilter/cors',
      filterClass: 'org.eclipse.jetty.ee10.servlets.CrossOriginFilter',
      note: 'kept',
      initParams: { ...IDM_CORS_FILTER_DEFAULTS.initParams },
      urlPatterns: ['/*'],
    });
    expect(output()).toContain(
      'Reset IDM CORS filter: initParams and urlPatterns are at the default values.'
    );
    expectNoEntryWriteAndNoFilterDelete();
  });

  test('a tenant whose filter has no filter class gets none', async () => {
    idmFilter = filter({
      initParams: {
        ...IDM_CORS_FILTER_DEFAULTS.initParams,
        allowedOrigins: 'x',
      },
    });

    await configManagerDeleteCors(undefined, false, false, { deep: true });

    expect(updateConfigEntity.mock.calls[0][1]).not.toHaveProperty(
      'filterClass'
    );
    expect(updateConfigEntity.mock.calls[0][1].initParams.allowedOrigins).toBe(
      '*'
    );
  });

  test('a filter that is at the defaults is not written, whatever the order of its keys, and the run says so', async () => {
    idmFilter = {
      urlPatterns: ['/*'],
      initParams: Object.fromEntries(
        Object.entries(IDM_CORS_FILTER_DEFAULTS.initParams).reverse()
      ),
      filterClass: 'org.eclipse.jetty.ee10.servlets.CrossOriginFilter',
      _id: 'servletfilter/cors',
    };

    expect(
      await configManagerDeleteCors(undefined, false, false, { deep: true })
    ).toBe(true);

    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(output()).toContain(
      'IDM CORS filter: already at the default values, nothing to write'
    );
  });

  test('a filter that differs by one default value is written', async () => {
    idmFilter = filter({
      initParams: {
        ...IDM_CORS_FILTER_DEFAULTS.initParams,
        chainPreflight: true,
      },
    });

    await configManagerDeleteCors(undefined, false, false, { deep: true });

    expect(updateConfigEntity).toHaveBeenCalledTimes(1);
  });

  test('a filter whose urlPatterns differ is written', async () => {
    idmFilter = filter({ urlPatterns: ['/*', '/extra/*'] });

    await configManagerDeleteCors(undefined, false, false, { deep: true });

    expect(updateConfigEntity).toHaveBeenCalledTimes(1);
    expect(updateConfigEntity.mock.calls[0][1].urlPatterns).toEqual(['/*']);
  });

  test('a dry run reads only, names the keys that differ and never their values, and keeps the filter class out of the change', async () => {
    idmFilter = filter({
      filterClass: 'org.eclipse.jetty.ee10.servlets.CrossOriginFilter',
      initParams: {
        ...IDM_CORS_FILTER_DEFAULTS.initParams,
        allowedOrigins: 'https://secret-origin.example.com',
        allowCredentials: true,
      },
      urlPatterns: ['/openidm/*'],
    });

    expect(
      await configManagerDeleteCors(undefined, true, false, { deep: true })
    ).toBe(true);

    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
    expect(output()).toContain(
      'Dry run: Resetting IDM CORS filter: initParams (allowCredentials, allowedOrigins) and urlPatterns would be set to the default values, the filter class is kept'
    );
    expect(output()).not.toContain('secret-origin');
    expect(output()).not.toContain('/openidm/*');
  });

  test('a dry run names an extra key that a reset would remove, and only what differs', async () => {
    idmFilter = filter({
      initParams: { ...IDM_CORS_FILTER_DEFAULTS.initParams, custom: 'x' },
    });

    await configManagerDeleteCors(undefined, true, false, { deep: true });

    expect(output()).toContain(
      'Dry run: Resetting IDM CORS filter: initParams (custom) would be set to the default values'
    );
    expect(output()).not.toContain('urlPatterns');
    expect(output()).not.toContain('the filter class is kept');
  });

  test('a plan says plan, and a filter at the defaults is said so in a dry run too', async () => {
    idmFilter = filter({ urlPatterns: [] });
    await configManagerDeleteCors(undefined, true, false, {
      deep: true,
      plan: true,
    });
    expect(output()).toContain(
      'Plan: Resetting IDM CORS filter: urlPatterns would be set'
    );

    printMessage.mockClear();
    idmFilter = filter();
    await configManagerDeleteCors(undefined, true, false, { deep: true });
    expect(output()).toContain(
      'IDM CORS filter: already at the default values, nothing to write'
    );
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });

  test('a classic deployment has no IDM: the part is skipped with its message, nothing is read, and that is no failure', async () => {
    deployment = 'classic';

    expect(
      await configManagerDeleteCors(undefined, false, false, { deep: true })
    ).toBe(true);

    expect(readConfigEntity).not.toHaveBeenCalled();
    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(deleted).toEqual(['cors', 'test', 'custom']);
    expect(output()).toContain(
      'IDM CORS filter: not applicable on a classic deployment, skipped'
    );
    expect(output()).toContain(
      'IDM CORS filter: skipped (classic deployment).'
    );
  });

  test('a tenant that has no such filter is a warning, not a failure', async () => {
    idmFilter = undefined;

    expect(
      await configManagerDeleteCors(undefined, false, false, { deep: true })
    ).toBe(true);

    expect(output()).toContain('IDM CORS filter: not found, nothing to reset');
    expect(levelOf('IDM CORS filter: not found')).toBe('warn');
    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(output()).toContain('IDM CORS filter: not found.');
  });

  test('a filter that cannot be read is one failed operation named IDM CORS filter: the configurations were deleted, the exit is 1, and --allow-failures keeps it at 0', async () => {
    idmReadError = new Error('read refused');

    expect(
      await configManagerDeleteCors(undefined, false, false, { deep: true })
    ).toBe(false);

    expect(deleted).toEqual(['cors', 'test', 'custom']);
    expect(updateConfigEntity).not.toHaveBeenCalled();
    expect(printError.mock.calls.map(([, text]) => text)).toContain(
      'Error reading the IDM CORS filter'
    );
    expect(summary()[0]).toBe(
      '1 of 4 CORS operations failed:\n  - IDM CORS filter: read refused'
    );
    expect(output()).toContain(
      'IDM CORS filter: not reset (failed, see above).'
    );

    expect(
      await configManagerDeleteCors(undefined, false, true, { deep: true })
    ).toBe(true);
  });

  test('a filter that cannot be written is one failed operation, and the closing lines say it was not reset', async () => {
    idmFilter = filter({ urlPatterns: ['/x'] });
    idmWriteError = new Error('write refused');

    expect(
      await configManagerDeleteCors(undefined, false, false, { deep: true })
    ).toBe(false);

    expect(deleted).toEqual(['cors', 'test', 'custom']);
    expect(printError.mock.calls.map(([, text]) => text)).toContain(
      'Error resetting the IDM CORS filter'
    );
    expect(summary()[0]).toContain('1 of 4 CORS operations failed');
    expect(summary()[0]).toContain('- IDM CORS filter: write refused');
    expect(output()).toContain(
      'IDM CORS filter: not reset (failed, see above).'
    );
    expect(output()).not.toContain('IDM CORS filter: reset.');
  });

  test('a configuration that fails and a filter that is reset: each is told apart, and the filter is reset anyway', async () => {
    refuse.set('test', new Error('could not delete test'));
    idmFilter = filter({ urlPatterns: ['/x'] });

    expect(
      await configManagerDeleteCors(undefined, false, false, { deep: true })
    ).toBe(false);

    expect(updateConfigEntity).toHaveBeenCalledTimes(1);
    expect(summary()[0]).toBe(
      '1 of 4 CORS operations failed:\n  - CORS configuration test: could not delete test'
    );
    expect(output()).toContain('IDM CORS filter: reset.');
  });

  test('the filter is reset also when the list of configurations could not be read, and the exit is 1', async () => {
    exportService.mockReset().mockRejectedValue(new Error('read failed'));
    idmFilter = filter({ urlPatterns: ['/x'] });

    expect(
      await configManagerDeleteCors(undefined, false, true, { deep: true })
    ).toBe(false);

    expect(updateConfigEntity).toHaveBeenCalledTimes(1);
    expect(deleteServiceNextDescendent).not.toHaveBeenCalled();
  });

  test('the filter is reset also when there is no configuration to delete', async () => {
    store = [];
    idmFilter = filter({ urlPatterns: ['/x'] });

    expect(
      await configManagerDeleteCors(undefined, false, false, { deep: true })
    ).toBe(true);

    expect(updateConfigEntity).toHaveBeenCalledTimes(1);
  });

  test('a dry run with a filter that cannot be read says so, still prints the configurations, and fails', async () => {
    idmReadError = new Error('read refused');

    expect(
      await configManagerDeleteCors(undefined, true, false, { deep: true })
    ).toBe(false);

    expect(output()).toContain(
      'IDM CORS filter: cannot be read, so it is not known what would be reset'
    );
    expect(levelOf('cannot be read')).toBe('error');
    expect(output()).toContain('Dry run: Deleting CORS configuration: cors');
    expect(output()).not.toContain('not reset (failed');
  });

  describe('what the summary counts', () => {
    // An operation is something the command did to the tenant, or read and found nothing to do: each
    // configuration, and the IDM filter when the tenant has one that is reset or already at the defaults.
    // A part that does not apply (a classic deployment, a tenant without the filter) is no operation.
    /** Runs a delete of all with --deep and one delete that fails, and returns the first line of the summary. */
    const firstLineOfSummary = async () => {
      refuse.set('test', new Error('could not delete test'));

      expect(
        await configManagerDeleteCors(undefined, false, false, { deep: true })
      ).toBe(false);

      return summary()[0].split('\n')[0];
    };

    test('a filter that is reset is one operation', async () => {
      idmFilter = filter({ urlPatterns: ['/x'] });

      expect(await firstLineOfSummary()).toBe('1 of 4 CORS operations failed:');
    });

    test('a filter that is already at the defaults is one operation too: it was read and compared, and there was nothing to write', async () => {
      idmFilter = filter();

      expect(await firstLineOfSummary()).toBe('1 of 4 CORS operations failed:');
      expect(updateConfigEntity).not.toHaveBeenCalled();
    });

    test('a filter that cannot be written is one operation, and a failed one', async () => {
      idmFilter = filter({ urlPatterns: ['/x'] });
      idmWriteError = new Error('write refused');

      expect(await firstLineOfSummary()).toBe('2 of 4 CORS operations failed:');
    });

    test('a tenant without the filter has no operation for it', async () => {
      idmFilter = undefined;

      expect(await firstLineOfSummary()).toBe('1 of 3 CORS operations failed:');
    });

    test('a classic deployment has no operation for it', async () => {
      deployment = 'classic';

      expect(await firstLineOfSummary()).toBe('1 of 3 CORS operations failed:');
    });

    test('a run without --deep counts the configurations only', async () => {
      refuse.set('test', new Error('could not delete test'));

      expect(await configManagerDeleteCors()).toBe(false);

      expect(summary()[0].split('\n')[0]).toBe(
        '1 of 3 CORS operations failed:'
      );
    });

    test('a dry run counts the same, so that it says how a real run would end', async () => {
      idmFilter = filter();
      store = [configuration('cors'), configuration('a#b')];

      expect(
        await configManagerDeleteCors(undefined, true, false, { deep: true })
      ).toBe(false);

      expect(summary()[0].split('\n')[0]).toBe(
        '1 of 3 CORS operations failed:'
      );
    });

    test.each([
      ['a dry run', {}],
      ['the plan before the question', { plan: true }],
    ])(
      '%s that would reset the filter counts it as one operation, so that it says how a real run would end',
      async (_name, extra) => {
        idmFilter = filter({ urlPatterns: ['/x'] });
        store = [configuration('cors'), configuration('a#b')];

        expect(
          await configManagerDeleteCors(undefined, true, false, {
            deep: true,
            ...extra,
          })
        ).toBe(false);

        expect(updateConfigEntity).not.toHaveBeenCalled();
        expect(summary()[0].split('\n')[0]).toBe(
          '1 of 3 CORS operations failed:'
        );
      }
    );
  });

  test('a real run says in its closing lines what was done, and that the CORS service entry was not changed', async () => {
    idmFilter = filter({ urlPatterns: ['/x'] });

    await configManagerDeleteCors(undefined, false, false, { deep: true });

    const closing = printMessage.mock.calls.at(-1)[0];
    expect(closing).toBe(
      ['IDM CORS filter: reset.', 'CORS service entry: not changed.'].join('\n')
    );
  });

  test('a run without --deep, a named delete and a dry run print no closing lines', async () => {
    await configManagerDeleteCors();
    await configManagerDeleteCors('cors');
    await configManagerDeleteCors(undefined, true, false, { deep: true });

    expect(output()).not.toContain('CORS service entry');
  });

  test('the service entry is never deleted or written and the filter never deleted, whatever fails', async () => {
    idmFilter = filter({ urlPatterns: ['/x'] });
    refuse.set('test', new Error('x'));
    idmWriteError = new Error('y');

    await configManagerDeleteCors(undefined, false, false, { deep: true });
    await configManagerDeleteCors(undefined, true, false, { deep: true });
    await configManagerDeleteCors('cors');

    expectNoEntryWriteAndNoFilterDelete();
  });
});
