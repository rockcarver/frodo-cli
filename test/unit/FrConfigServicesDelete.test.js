import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * `config-manager delete services`: the operation behind the command
 * (`configManagerDeleteServices` in src/configManagerOps/FrConfigServiceOps.ts),
 * with the library replaced by a stub that keeps the services of each realm in
 * memory. The run tracker, the cause helper and the module under test are real.
 *
 * What it pins: the services of a realm are read the way `pull services` reads
 * them and the LISTED id is what is deleted (the text that was typed never
 * reaches a request, and neither does a listed id that is not a plain name); a
 * named service that is not listed fails the command whatever `--allow-failures`
 * says; a delete of all services leaves `DataStoreService` alone, skips the root
 * realm on Cloud only, and tries every service and every realm: one that fails
 * does not stop the others, the summary names each failed service and counts
 * services, and `--allow-failures` keeps the exit at 0 for a failed delete but
 * not for a realm whose services could not be listed.
 *
 * The same operation against a real fake tenant is in
 * ConfigManagerDeleteServicesFakeTenant.test.js, the command line in
 * ConfigManagerDeleteServicesCommand.test.js.
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

let realmNow;
let deployment;
/** What each realm holds: the full services the library would read. */
let store;
const getFullServices = jest.fn();
const deleteFullService = jest.fn();
const importServices = jest.fn();
const realmList = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();
const setRealm = jest.fn((realm) => {
  realmNow = realm;
});

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  frodo: {
    service: { getFullServices, deleteFullService, importServices },
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        DEFAULT_REALM_KEY: '__default__realm__',
      },
      getFilePath: jest.fn(),
      saveJsonToFile: jest.fn(),
      getWorkingDirectory: jest.fn(),
      readJsonFile: jest.fn(),
    },
  },
  state: {
    getRealm: () => realmNow,
    setRealm,
    getDeploymentType: () => deployment,
  },
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createProgressIndicator: jest.fn(),
  printError,
  printMessage,
  stopProgressIndicator: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/ServiceOps', () => ({
  combinedServiceError: jest.fn(),
  importedServiceNameOf: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ConfigTreePath', () => ({
  nameInFolder: jest.fn(),
  pulledFilePath: jest.fn(),
  PulledPaths: class {},
  realmFolderOf: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({ realmList }));

const { configManagerDeleteServices, EXCLUDE_SERVICES } =
  await import('../../src/configManagerOps/FrConfigServiceOps');

/** A service as the library reads it: the type is the id (a read answers `_id: ""`), with its next descendents. */
const service = (id, descendents = []) => ({
  _id: '',
  _type: { _id: id, name: id, collection: true },
  nextDescendents: descendents.map(([type, descendentId]) => ({
    _id: descendentId,
    _type: { _id: type },
  })),
});

/** The messages that were printed, as one text. */
const output = () =>
  printMessage.mock.calls.map(([text]) => String(text)).join('\n');
/** The level of the first message that contains `text`. */
const levelOf = (text) =>
  printMessage.mock.calls.find(([message]) =>
    String(message).includes(text)
  )?.[1];
/** What was deleted, as `realm/id` (`/id` in the root realm), in order. */
let deleted;
/** The ids that the stub of the delete was told to refuse. */
let refuse;

beforeEach(() => {
  jest.clearAllMocks();
  realmNow = 'before';
  deployment = 'forgeops';
  deleted = [];
  refuse = new Map();
  store = {
    '/': [service('session'), service('baseurl'), service('DataStoreService')],
    alpha: [
      service('email', [['smtpTransports', 'SMTP']]),
      service('id-repositories', [['LDAPv3ForForgeRockIAM', 'OpenDJ']]),
      service('session'),
      service('DataStoreService'),
    ],
    bravo: [service('session'), service('validation')],
  };
  realmList.mockReset().mockResolvedValue(['/', 'alpha', 'bravo']);
  getFullServices
    .mockReset()
    .mockImplementation(async () => structuredClone(store[realmNow] ?? []));
  deleteFullService.mockReset().mockImplementation(async (id) => {
    if (refuse.has(id)) throw refuse.get(id);
    deleted.push(`${realmNow === '/' ? '' : realmNow}/${id}`);
    return { _id: id };
  });
});

describe('the library calls', () => {
  test('services are read and deleted in the realm and never as global services, with the one id and nothing else', async () => {
    expect(await configManagerDeleteServices('email', 'alpha')).toBe(true);

    expect(getFullServices).toHaveBeenCalledTimes(1);
    expect(getFullServices.mock.calls[0][0]).toBe(false);
    expect(deleteFullService.mock.calls).toEqual([['email']]);
    expect(deleted).toEqual(['alpha/email']);
  });

  test('the realm of the caller is found as it was after the run', async () => {
    await configManagerDeleteServices(undefined, undefined, false);

    expect(realmNow).toBe('before');
  });
});

describe('a named delete: the id is looked up in what the realm lists', () => {
  test('deletes the listed id and says what went with it', async () => {
    expect(await configManagerDeleteServices('email', 'alpha')).toBe(true);

    expect(deleted).toEqual(['alpha/email']);
    expect(output()).toContain(
      "Deleted service 'email' in realm 'alpha' (with next descendents: smtpTransports/SMTP)."
    );
    expect(printError).not.toHaveBeenCalled();
  });

  test('a service without next descendents is deleted without that sentence', async () => {
    expect(await configManagerDeleteServices('session', 'alpha')).toBe(true);

    expect(output()).toContain("Deleted service 'session' in realm 'alpha'.");
    expect(output()).not.toContain('next descendents:');
  });

  test.each([
    ['Email', 'another case'],
    [' email', 'a leading blank'],
    ['email ', 'a trailing blank'],
    ['email/', 'a slash'],
    ['../realms/root', 'a path'],
    ['a#b', 'a fragment'],
    ['x/y', 'a path of two names'],
    ['ema', 'a part of the id'],
    ['%65mail', 'an encoded letter'],
  ])(
    '%j (%s) is not an id of the realm: nothing is deleted, the command fails, and the text never reaches a request',
    async (typed) => {
      expect(await configManagerDeleteServices(typed, 'alpha')).toBe(false);

      expect(deleteFullService).not.toHaveBeenCalled();
      expect(output()).toContain(
        `Service '${typed}' not found in realm 'alpha'.`
      );
      expect(levelOf('not found')).toBe('error');
      // the only requests are the reads of the realm, none of which carries the typed text
      expect(JSON.stringify(getFullServices.mock.calls)).not.toContain(typed);
    }
  );

  test.each([
    ['a real run', [undefined, undefined]],
    ['a dry run', [true, undefined]],
    ['--allow-failures', [undefined, true]],
    ['a dry run with --allow-failures', [true, true]],
  ])(
    'a service that is not there fails the command in %s',
    async (_name, [dryRun, allowFailures]) => {
      expect(
        await configManagerDeleteServices(
          'nope',
          'alpha',
          dryRun,
          allowFailures
        )
      ).toBe(false);

      expect(deleteFullService).not.toHaveBeenCalled();
      expect(output()).toContain("Service 'nope' not found in realm 'alpha'.");
      // a miss is not a failed operation among others: no summary, no "stays 0"
      expect(output()).not.toContain('failed');
    }
  );

  test('a service that is read in another realm is not the one of this realm', async () => {
    expect(await configManagerDeleteServices('validation', 'alpha')).toBe(
      false
    );

    expect(deleted).toEqual([]);
  });

  test('a delete that the tenant refuses fails the command, names the service, and --allow-failures keeps the exit at 0', async () => {
    refuse.set(
      'email',
      new FrodoError('Error deleting alpha realm full service config email', [
        Object.assign(new Error('Request failed with status code 403'), {
          httpMessage:
            'This operation is not available in PingOne Advanced Identity Cloud.',
        }),
      ])
    );

    expect(await configManagerDeleteServices('email', 'alpha')).toBe(false);
    expect(output()).toContain('1 of 1 service failed:');
    expect(output()).toContain(
      '- alpha/email: This operation is not available in PingOne Advanced Identity Cloud.'
    );

    printMessage.mockClear();
    expect(
      await configManagerDeleteServices('email', 'alpha', false, true)
    ).toBe(true);
    expect(output()).toContain('The exit code stays 0');
  });

  test('a service that could not be read is a failed service, is not deleted, and is not a miss', async () => {
    getFullServices
      .mockReset()
      .mockImplementation(async (_global, callback) => {
        callback(
          new FrodoError("Unable to retrieve data for service 'email'", [
            new Error('read failed'),
          ])
        );
        return [service('session')];
      });

    expect(await configManagerDeleteServices('email', 'alpha')).toBe(false);

    expect(deleteFullService).not.toHaveBeenCalled();
    expect(output()).not.toContain('not found');
    expect(output()).toContain('1 of 1 service failed:');
    expect(output()).toContain('- alpha/email: read failed');
  });

  test('DataStoreService can be named: it is spared by a delete of all, not by a delete that names it', async () => {
    expect(await configManagerDeleteServices('DataStoreService', 'alpha')).toBe(
      true
    );

    expect(deleted).toEqual(['alpha/DataStoreService']);
  });

  test('a listed id that is not a plain name is never sent, even when that is what was typed', async () => {
    store.alpha = [service('a/b')];

    expect(await configManagerDeleteServices('a/b', 'alpha')).toBe(false);

    expect(deleteFullService).not.toHaveBeenCalled();
    expect(output()).toContain(
      "Service 'a/b' is listed with an id that is not a plain name"
    );
    expect(output()).toContain('no request was sent for it');
  });

  test('a dry run reads and says what would be deleted, with what goes with it, and deletes nothing', async () => {
    expect(await configManagerDeleteServices('email', 'alpha', true)).toBe(
      true
    );

    expect(deleteFullService).not.toHaveBeenCalled();
    expect(output()).toContain(
      "Dry run: Deleting service 'email' in realm 'alpha'."
    );
    expect(output()).toContain(
      'Next descendents that go with it: smtpTransports/SMTP'
    );
  });

  test('a service that a realm commonly depends on is named as one, after a real run and in a dry run', async () => {
    expect(await configManagerDeleteServices('email', 'alpha')).toBe(true);
    expect(
      levelOf("Service 'email' is one that a realm commonly depends on")
    ).toBe('warn');
    expect(output()).toContain(
      'the sender address and the mail transports of the realm go with it'
    );

    printMessage.mockClear();
    expect(await configManagerDeleteServices('email', 'alpha', true)).toBe(
      true
    );
    expect(output()).toContain(
      "Service 'email' is one that a realm commonly depends on"
    );

    printMessage.mockClear();
    store.alpha = [service('custom')];
    expect(await configManagerDeleteServices('custom', 'alpha')).toBe(true);
    expect(output()).not.toContain('commonly depends on');
  });

  test('a named delete needs a realm: without one nothing is read', async () => {
    for (const realm of [undefined, '', '__default__realm__']) {
      expect(await configManagerDeleteServices('email', realm)).toBe(false);
    }

    expect(getFullServices).not.toHaveBeenCalled();
    expect(realmList).not.toHaveBeenCalled();
    expect(output()).toContain(
      'The -i, --service-id option requires a realm argument'
    );
  });

  test.each([[''], ['   '], ['\t']])(
    'a blank id (%j) is refused and never means all services',
    async (blank) => {
      expect(await configManagerDeleteServices(blank, 'alpha')).toBe(false);

      expect(getFullServices).not.toHaveBeenCalled();
      expect(deleteFullService).not.toHaveBeenCalled();
      expect(output()).toContain('The service id must not be empty');
    }
  );
});

describe('a delete of all services', () => {
  test('deletes what pull services covers in every realm, in its realm, with the listed ids', async () => {
    expect(await configManagerDeleteServices(undefined, undefined)).toBe(true);

    expect(deleted).toEqual([
      '/session',
      '/baseurl',
      'alpha/email',
      'alpha/id-repositories',
      'alpha/session',
      'bravo/session',
      'bravo/validation',
    ]);
    expect(output()).toContain(
      "Deleted service 'id-repositories' in realm 'alpha' (with next descendents: LDAPv3ForForgeRockIAM/OpenDJ)."
    );
  });

  test('DataStoreService is never deleted, in any realm', async () => {
    expect(EXCLUDE_SERVICES).toEqual(['DataStoreService']);

    await configManagerDeleteServices(undefined, undefined);

    expect(
      deleted.filter((entry) => entry.endsWith('DataStoreService'))
    ).toEqual([]);
    expect(deleteFullService).toHaveBeenCalledTimes(7);
  });

  test('a given realm limits the run to that realm and asks for no list of realms', async () => {
    expect(await configManagerDeleteServices(undefined, 'bravo')).toBe(true);

    expect(realmList).not.toHaveBeenCalled();
    expect(deleted).toEqual(['bravo/session', 'bravo/validation']);
  });

  test('the sentinel realm of the library means every realm', async () => {
    await configManagerDeleteServices(undefined, '__default__realm__');

    expect(realmList).toHaveBeenCalledTimes(1);
    expect(deleted.length).toBe(7);
  });

  test('the root realm is skipped on Cloud and processed on the other deployments', async () => {
    deployment = 'cloud';
    expect(await configManagerDeleteServices(undefined, undefined)).toBe(true);
    expect(deleted.filter((entry) => entry.startsWith('/'))).toEqual([]);
    expect(deleted.length).toBe(5);
    expect(output()).toContain(
      'The root realm (/) is skipped on a Cloud tenant.'
    );

    for (const other of ['forgeops', 'classic']) {
      deployment = other;
      deleted.length = 0;
      expect(await configManagerDeleteServices(undefined, undefined)).toBe(
        true
      );
      expect(deleted.filter((entry) => entry.startsWith('/'))).toEqual([
        '/session',
        '/baseurl',
      ]);
    }
  });

  test('the root realm named on Cloud is skipped too', async () => {
    deployment = 'cloud';

    expect(await configManagerDeleteServices(undefined, '/')).toBe(true);

    expect(deleted).toEqual([]);
    expect(getFullServices).not.toHaveBeenCalled();
  });

  test('a realm without services is a warning and the command succeeds', async () => {
    store.bravo = [];
    store.alpha = [];
    store['/'] = [];

    expect(await configManagerDeleteServices(undefined, undefined)).toBe(true);

    expect(deleteFullService).not.toHaveBeenCalled();
    expect(levelOf("No services found to delete in realm 'alpha'.")).toBe(
      'warn'
    );
    expect(output()).toContain("No services found to delete in realm 'bravo'.");
  });

  test('a realm that holds only DataStoreService has nothing to delete', async () => {
    store.alpha = [service('DataStoreService')];

    expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(true);

    expect(deleteFullService).not.toHaveBeenCalled();
    expect(output()).toContain("No services found to delete in realm 'alpha'.");
  });

  test('no realms at all is a warning and a success', async () => {
    realmList.mockReset().mockResolvedValue([]);

    expect(await configManagerDeleteServices(undefined, undefined)).toBe(true);

    expect(levelOf('No realms found')).toBe('warn');
  });

  test('realms that cannot be listed fail the command and nothing is read', async () => {
    realmList.mockReset().mockRejectedValue(new Error('no realms'));

    expect(await configManagerDeleteServices(undefined, undefined)).toBe(false);

    expect(getFullServices).not.toHaveBeenCalled();
    expect(printError).toHaveBeenCalled();
  });

  test('a dry run reads every realm, deletes nothing, and says what would be deleted and which services a realm depends on', async () => {
    expect(await configManagerDeleteServices(undefined, undefined, true)).toBe(
      true
    );

    expect(deleteFullService).not.toHaveBeenCalled();
    expect(getFullServices).toHaveBeenCalledTimes(3);
    const text = output();
    expect(text).toContain(
      'Dry run: nothing is deleted. 7 services in 3 realms (/, alpha, bravo) would be deleted, each with its next descendents.'
    );
    expect(text).toContain("Realm 'alpha' (3 services):");
    expect(text).toContain(
      '- id-repositories (1 next descendent): the identity stores of the realm go with it'
    );
    expect(text).toContain(
      '- validation: the list of the valid goto URLs of the realm goes with it'
    );
    expect(text).toContain(
      'DataStoreService is never deleted by a delete of all services.'
    );
  });

  test('the plan before a question says plan and not dry run, and counts one service and one realm in the singular', async () => {
    store.alpha = [service('custom')];

    expect(
      await configManagerDeleteServices(undefined, 'alpha', true, false, {
        plan: true,
      })
    ).toBe(true);

    expect(output()).toContain(
      'Plan: 1 service in 1 realm (alpha) would be deleted, each with its next descendents.'
    );
    expect(output()).not.toContain('Dry run');
    expect(deleteFullService).not.toHaveBeenCalled();
  });
});

describe('every service is one operation of one summary', () => {
  test('one of three fails and the others are still deleted; the summary names it and the exit is 1', async () => {
    store.alpha = [service('a1'), service('a2'), service('a3')];
    refuse.set('a2', new Error('a2 refused'));

    expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(false);

    expect(deleted).toEqual(['alpha/a1', 'alpha/a3']);
    expect(output()).toContain('1 of 3 services failed:');
    expect(output()).toContain('- alpha/a2: a2 refused');
    expect(levelOf('1 of 3 services failed')).toBe('error');
  });

  test('the summary counts services and not realms, and names the root realm as /id', async () => {
    refuse.set('session', new Error('session refused'));

    expect(await configManagerDeleteServices(undefined, undefined)).toBe(false);

    // the three realms hold five more services; three of the eight operations fail
    expect(output()).toContain('3 of 7 services failed:');
    expect(output()).toContain('- /session: session refused');
    expect(output()).toContain('- alpha/session: session refused');
    expect(output()).toContain('- bravo/session: session refused');
    expect(deleted).toEqual([
      '/baseurl',
      'alpha/email',
      'alpha/id-repositories',
      'bravo/validation',
    ]);
  });

  test('--allow-failures keeps the exit at 0 for a failed delete, and says so', async () => {
    refuse.set('session', new Error('session refused'));

    expect(
      await configManagerDeleteServices(undefined, undefined, false, true)
    ).toBe(true);

    expect(output()).toContain('3 of 7 services failed:');
    expect(output()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
  });

  test('a delete counts as done after the delete and not before it', async () => {
    store.alpha = [service('only')];
    refuse.set('only', new Error('refused'));

    expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(false);

    expect(output()).toContain('1 of 1 service failed:');
    expect(output()).not.toContain("Deleted service 'only'");
  });

  test('a service that cannot be read is failed and not deleted, and the others of the realm are', async () => {
    getFullServices
      .mockReset()
      .mockImplementation(async (_global, callback) => {
        callback(
          new FrodoError("Unable to retrieve data for service 'broken'", [
            new Error('read failed'),
          ])
        );
        return [service('a1'), service('a2')];
      });

    expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(false);

    expect(deleted).toEqual(['alpha/a1', 'alpha/a2']);
    expect(output()).toContain('1 of 3 services failed:');
    expect(output()).toContain('- alpha/broken: read failed');
  });

  test('a realm whose services cannot be listed is one failed operation and the other realms are still processed', async () => {
    getFullServices.mockReset().mockImplementation(async () => {
      if (realmNow === 'alpha') {
        throw new FrodoError('Error getting alpha realm full service configs', [
          new Error('listing failed'),
        ]);
      }
      return structuredClone(store[realmNow] ?? []);
    });

    expect(await configManagerDeleteServices(undefined, undefined)).toBe(false);

    expect(deleted).toEqual([
      '/session',
      '/baseurl',
      'bravo/session',
      'bravo/validation',
    ]);
    expect(output()).toContain('1 of 5 services failed:');
    expect(output()).toContain('- realm alpha: listing failed');
  });

  test('--allow-failures does not turn a realm whose services cannot be listed into a success', async () => {
    getFullServices.mockReset().mockImplementation(async () => {
      if (realmNow === 'alpha') throw new Error('listing failed');
      return structuredClone(store[realmNow] ?? []);
    });
    refuse.set('baseurl', new Error('baseurl refused'));

    expect(
      await configManagerDeleteServices(undefined, undefined, false, true)
    ).toBe(false);

    expect(output()).toContain(
      '--allow-failures does not apply to a realm whose services could not be listed.'
    );
    expect(output()).not.toContain('The exit code stays 0');
    expect(output()).toContain('- realm alpha: listing failed');
    expect(output()).toContain('- /baseurl: baseurl refused');
  });

  test('a dry run with a realm that cannot be listed fails too', async () => {
    getFullServices.mockReset().mockRejectedValue(new Error('listing failed'));

    expect(await configManagerDeleteServices(undefined, 'alpha', true)).toBe(
      false
    );

    expect(output()).toContain('- realm alpha: listing failed');
  });
});

describe('a listed id that is not a plain name is never sent', () => {
  const HOSTILE = [
    ['..', 'a dot dot'],
    ['.', 'a dot'],
    ['../realms/root', 'a path up'],
    ['a/b', 'a slash'],
    ['a\\b', 'a backslash'],
    ['a?b', 'a query'],
    ['a#b', 'a fragment'],
    ['a%2Fb', 'a percent'],
    ['a\u0001b', 'a control character'],
    ['a\u007fb', 'DEL'],
    ['a\u0085b', 'a control character of the second block'],
    ['  ', 'blanks'],
    ['', 'nothing'],
  ];

  test.each(HOSTILE)(
    '%j (%s) is skipped with a message, counted as failed, and no delete is made for it',
    async (hostile) => {
      store.alpha = [service('email'), service(hostile)];

      expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(false);

      expect(deleted).toEqual(['alpha/email']);
      expect(deleteFullService.mock.calls.map(([id]) => id)).toEqual(['email']);
      expect(output()).toContain('is listed in realm');
      expect(output()).toContain('not a plain name');
      expect(output()).toContain('1 of 2 services failed:');
      expect(output()).toContain('its id is not a plain name');
      // no control character reaches the terminal
      // eslint-disable-next-line no-control-regex
      expect(output()).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
    }
  );

  test('the dry run names them and says that each would count as a failed delete', async () => {
    store.alpha = [service('email'), service('a/b')];

    expect(await configManagerDeleteServices(undefined, 'alpha', true)).toBe(
      true
    );

    expect(output()).toContain('These listed ids are not plain names');
    expect(output()).toContain('alpha/a/b');
    expect(output()).toContain('- email');
    expect(deleteFullService).not.toHaveBeenCalled();
  });

  test('--allow-failures keeps the exit at 0 for it, as for any failed delete', async () => {
    store.alpha = [service('a/b')];

    expect(
      await configManagerDeleteServices(undefined, 'alpha', false, true)
    ).toBe(true);

    expect(deleteFullService).not.toHaveBeenCalled();
  });

  test('an id that is plain but unusual is deleted: dots, dashes, upper case and digits are names', async () => {
    store.alpha = [
      service('oauth-oidc'),
      service('a.b'),
      service('SocialIdentityProviders'),
      service('v2'),
    ];

    expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(true);

    expect(deleted).toEqual([
      'alpha/oauth-oidc',
      'alpha/a.b',
      'alpha/SocialIdentityProviders',
      'alpha/v2',
    ]);
  });
});
