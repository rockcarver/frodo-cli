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
  // what the real one does for the realms of these tests: a part that is `..` is no realm name
  realmFolderOf: jest.fn((realm) => {
    const parts = realm.split('/').filter((part) => part !== '');
    if (realm !== '/' && (parts.length === 0 || parts.includes('..'))) {
      throw new Error(
        `The realm '${realm}' is not '/', a name or a path of names.`
      );
    }
    return realm === '/' ? 'root' : parts.join('/');
  }),
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
      "Service 'a/b' is listed in realm 'alpha' with an id that is not a plain name"
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

  test('the summary counts services and not realms, and names the root realm as root/id', async () => {
    refuse.set('session', new Error('session refused'));

    expect(await configManagerDeleteServices(undefined, undefined)).toBe(false);

    // the three realms hold five more services; three of the eight operations fail
    expect(output()).toContain('3 of 7 services failed:');
    expect(output()).toContain('- root/session: session refused');
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

  test('--allow-failures keeps the exit at 0 for a realm whose services cannot be listed, like for any failed operation, and names it', async () => {
    getFullServices.mockReset().mockImplementation(async () => {
      if (realmNow === 'alpha') throw new Error('listing failed');
      return structuredClone(store[realmNow] ?? []);
    });
    refuse.set('baseurl', new Error('baseurl refused'));

    expect(
      await configManagerDeleteServices(undefined, undefined, false, true)
    ).toBe(true);

    expect(output()).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
    expect(output()).toContain('- realm alpha: listing failed');
    expect(output()).toContain('- root/baseurl: baseurl refused');
    expect(output()).not.toContain('does not apply');
  });

  test('the root realm that cannot be listed is named realm root in the summary', async () => {
    getFullServices.mockReset().mockImplementation(async () => {
      if (realmNow === '/') throw new Error('listing failed');
      return structuredClone(store[realmNow] ?? []);
    });

    expect(await configManagerDeleteServices(undefined, undefined)).toBe(false);

    expect(output()).toContain('- realm root: listing failed');
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
    ['a..b', 'a double dot inside the id'],
    ['a..', 'a double dot at the end'],
    ['a?b', 'a query'],
    ['a#b', 'a fragment'],
    ['a%2Fb', 'a percent'],
    ['a\u0001b', 'a control character'],
    ['a\u007fb', 'DEL'],
    ['a\u0085b', 'a control character of the second block'],
    ['a\u202eb', 'a right-to-left override'],
    ['a\u200bb', 'a zero width space'],
    ['\ufeffa', 'a byte order mark'],
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
      // nor a format character, which would change what the terminal shows without being seen
      expect(output()).not.toMatch(/[\u200b-\u200f\u202a-\u202e\ufeff]/);
    }
  );

  test('the dry run names them, says that each would count as a failed delete, and fails as the real run does; --allow-failures forgives it in both', async () => {
    store.alpha = [service('email'), service('a/b')];

    // it says how the real run would end: the real run fails for such an id, so the dry run fails
    expect(await configManagerDeleteServices(undefined, 'alpha', true)).toBe(
      false
    );

    expect(output()).toContain('are not plain names');
    expect(output()).toContain('alpha/a/b');
    expect(output()).toContain('1 of 2 services failed:');
    expect(output()).toContain('- email');
    expect(deleteFullService).not.toHaveBeenCalled();

    expect(
      await configManagerDeleteServices(undefined, 'alpha', true, true)
    ).toBe(true);
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

describe('a next descendent that is not a plain name stops the delete of its service', () => {
  // the library builds the delete of a next descendent from its type and its id as the realm lists them
  const HOSTILE_DESCENDENTS = [
    [
      ['smtpTransports', '../../session'],
      'an id that climbs out of the service',
    ],
    [['../session', 'x'], 'a type that climbs out of the service'],
    [['smtpTransports', 'a#b'], 'an id with a fragment'],
    [['smtpTransports', 'q?x'], 'an id with a query'],
    [['smtpTransports', 'a/b'], 'an id with a slash'],
    [['smtp/Transports', 'SMTP'], 'a type with a slash'],
    [['smtpTransports', 'a%2e%2e'], 'an id with a percent sign'],
    [['smtpTransports', 'a..b'], 'an id with a double dot inside'],
    [['smtpTransports', ''], 'no id'],
    [['', 'SMTP'], 'no type'],
    [['smtpTransports', 'a\u0001b'], 'an id with a control character'],
    [['smtpTransports', 'a\u202eb'], 'an id with a right-to-left override'],
    [['smtp\u200bTransports', 'SMTP'], 'a type with a zero width space'],
  ];
  const shown = ([type, id]) =>
    `${type}/${id}`.replace(
      /[\p{Cc}\p{Cf}]/gu,
      (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`
    );

  test.each(HOSTILE_DESCENDENTS)(
    'a named delete of a service with the next descendent %j (%s) sends no delete, names the descendent and exits 1',
    async (descendent) => {
      store.alpha = [
        service('email', [descendent, ['smtpTransports', 'SMTP']]),
      ];

      expect(await configManagerDeleteServices('email', 'alpha')).toBe(false);

      expect(deleteFullService).not.toHaveBeenCalled();
      expect(deleted).toEqual([]);
      expect(output()).toContain(
        `Next descendent '${shown(descendent)}' of service 'email'`
      );
      expect(output()).toContain('not a plain name');
      expect(output()).toContain(
        'the service is not deleted, and no request was sent for it'
      );
      // eslint-disable-next-line no-control-regex
      expect(output()).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
    }
  );

  test.each(HOSTILE_DESCENDENTS)(
    'a delete of all services with the next descendent %j (%s) deletes the others, sends none for that service, names the descendent and fails',
    async (descendent) => {
      store.alpha = [
        service('custom'),
        service('email', [descendent, ['smtpTransports', 'SMTP']]),
        service('session'),
      ];

      expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(false);

      expect(deleted).toEqual(['alpha/custom', 'alpha/session']);
      expect(deleteFullService.mock.calls.map(([id]) => id)).toEqual([
        'custom',
        'session',
      ]);
      expect(output()).toContain('1 of 3 services failed:');
      expect(output()).toContain(
        `- alpha/email: its next descendent ${shown(descendent)} has a type or an id that is not a plain name`
      );
    }
  );

  test('a service with several unsafe next descendents is one failure of the run, and every one of them is named', async () => {
    store.alpha = [
      service('email', [
        ['smtpTransports', '../../session'],
        ['smtpTransports', 'a#b'],
        ['smtpTransports', 'SMTP'],
      ]),
      service('custom'),
    ];

    expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(false);

    expect(deleted).toEqual(['alpha/custom']);
    expect(deleteFullService.mock.calls.map(([id]) => id)).toEqual(['custom']);
    // one service failed, whatever number of next descendents made it so
    expect(output()).toContain('1 of 2 services failed:');
    expect(output()).not.toContain('2 of');
    expect(output()).toContain(
      '- alpha/email: its next descendents smtpTransports/../../session, smtpTransports/a#b have a type or an id that is not a plain name'
    );
    // each one has its own line of explanation above the summary
    expect(output()).toContain(
      "Next descendent 'smtpTransports/../../session' of service 'email'"
    );
    expect(output()).toContain(
      "Next descendent 'smtpTransports/a#b' of service 'email'"
    );
  });

  test('a service with an id that is not plain and unsafe next descendents is still one failure, for its own id', async () => {
    store.alpha = [
      service('a/b', [['smtpTransports', 'a#b']]),
      service('custom'),
    ];

    expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(false);

    expect(deleted).toEqual(['alpha/custom']);
    expect(output()).toContain('1 of 2 services failed:');
    expect(output()).toContain('- alpha/a/b: its id is not a plain name');
  });

  test('a dry run of all services fails like the real run, names the descendents in the plan, and does not list the service as deletable', async () => {
    store.alpha = [
      service('custom'),
      service('email', [['smtpTransports', '../../session']]),
    ];

    expect(await configManagerDeleteServices(undefined, 'alpha', true)).toBe(
      false
    );

    expect(output()).toContain('1 service in 1 realm (alpha) would be deleted');
    expect(output()).toContain('- custom');
    expect(output()).not.toContain('- email');
    expect(output()).toContain('alpha/email/smtpTransports/../../session');
    expect(output()).toContain('1 of 2 services failed:');
    expect(deleteFullService).not.toHaveBeenCalled();

    printMessage.mockClear();
    expect(
      await configManagerDeleteServices(undefined, 'alpha', true, true)
    ).toBe(true);
  });

  test('a named dry run of such a service fails too, and sends nothing', async () => {
    store.alpha = [service('email', [['smtpTransports', '../../session']])];

    expect(await configManagerDeleteServices('email', 'alpha', true)).toBe(
      false
    );

    expect(output()).not.toContain('Dry run: Deleting service');
    expect(deleteFullService).not.toHaveBeenCalled();
  });

  test('--allow-failures keeps the exit at 0 for it in a delete of all services, and never for a named one', async () => {
    store.alpha = [service('email', [['smtpTransports', '../../session']])];

    expect(
      await configManagerDeleteServices(undefined, 'alpha', false, true)
    ).toBe(true);
    expect(
      await configManagerDeleteServices('email', 'alpha', false, true)
    ).toBe(false);

    expect(deleteFullService).not.toHaveBeenCalled();
  });

  test('plain next descendents of any shape that a tenant lists are deleted with the service', async () => {
    store.alpha = [
      service('email', [
        ['smtpTransports', 'SMTP'],
        ['LDAPv3ForForgeRockIAM', 'Open-DJ.2'],
      ]),
    ];

    expect(await configManagerDeleteServices('email', 'alpha')).toBe(true);

    expect(deleted).toEqual(['alpha/email']);
  });
});

describe('another service of the realm that cannot be read', () => {
  const unreadable = (id) =>
    new FrodoError(`Unable to retrieve data for service '${id}'`, [
      new Error('read failed'),
    ]);
  const withUnreadable = (id, services) =>
    getFullServices
      .mockReset()
      .mockImplementation(async (_global, callback) => {
        callback(unreadable(id));
        return services;
      });

  test.each([
    ['a real run', [false, false]],
    ['a dry run', [true, false]],
    ['--allow-failures', [false, true]],
    ['a dry run with --allow-failures', [true, true]],
  ])(
    'does not turn a named service that is not there into anything but exit 1: %s',
    async (_name, [dryRun, allowFailures]) => {
      withUnreadable('session', [service('email')]);

      expect(
        await configManagerDeleteServices(
          'NOPE',
          'alpha',
          dryRun,
          allowFailures
        )
      ).toBe(false);

      expect(output()).toContain("Service 'NOPE' not found in realm 'alpha'.");
      expect(deleteFullService).not.toHaveBeenCalled();
    }
  );

  test('is a warning in a named delete, which counts the named service only: it is deleted and the command succeeds', async () => {
    withUnreadable('session', [service('email')]);

    expect(await configManagerDeleteServices('email', 'alpha')).toBe(true);

    expect(deleted).toEqual(['alpha/email']);
    expect(
      levelOf(
        "Service 'session' of realm 'alpha' could not be read, and was not named: read failed"
      )
    ).toBe('warn');
    expect(output()).not.toContain('failed:');
    expect(printError).not.toHaveBeenCalled();
  });

  test('is a warning in a named dry run too, and the dry run succeeds', async () => {
    withUnreadable('session', [service('email')]);

    expect(await configManagerDeleteServices('email', 'alpha', true)).toBe(
      true
    );

    expect(levelOf('could not be read, and was not named')).toBe('warn');
    expect(output()).toContain(
      "Dry run: Deleting service 'email' in realm 'alpha'."
    );
  });

  test('is still a failed service in a delete of all services', async () => {
    withUnreadable('session', [service('email')]);

    expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(false);

    expect(deleted).toEqual(['alpha/email']);
    expect(output()).toContain('1 of 2 services failed:');
    expect(output()).toContain('- alpha/session: read failed');
    expect(output()).not.toContain('was not named');
  });
});

describe('what a delete says about the services that a realm depends on', () => {
  test('a delete of all services prints no sentence about them after the delete: the plan said it, and -y chose it', async () => {
    store.alpha = [
      service('email'),
      service('session'),
      service('id-repositories'),
    ];

    expect(await configManagerDeleteServices(undefined, 'alpha')).toBe(true);

    expect(output()).not.toContain('commonly depends on');
    expect(levelOf('commonly depends on')).toBeUndefined();
  });

  test('a named delete of DataStoreService says that push services cannot bring it back', async () => {
    expect(await configManagerDeleteServices('DataStoreService', 'alpha')).toBe(
      true
    );

    expect(deleted).toEqual(['alpha/DataStoreService']);
    expect(output()).toContain(
      "Service 'DataStoreService' is one that a realm commonly depends on: pull services never exports what it holds, so push services cannot bring it back."
    );
  });

  test('DataStoreService is not in the plan of a delete of all services, which says that it is never deleted', async () => {
    expect(await configManagerDeleteServices(undefined, 'alpha', true)).toBe(
      true
    );

    expect(output()).not.toContain('- DataStoreService');
    expect(output()).toContain(
      'DataStoreService is never deleted by a delete of all services.'
    );
  });
});

describe('a service whose id is also a property name of an object', () => {
  // the notes about the services that a realm commonly depends on are looked up by id: an id that an
  // object has as a property of its own (constructor, toString, __proto__) is no service with a note
  const PROPERTY_NAMES = [
    'constructor',
    'toString',
    'valueOf',
    'hasOwnProperty',
    '__proto__',
  ];

  test.each(PROPERTY_NAMES)(
    '%s is listed in a plan and in a dry run of all services like any service, with no note',
    async (id) => {
      store.alpha = [service(id), service('email')];

      expect(await configManagerDeleteServices(undefined, 'alpha', true)).toBe(
        true
      );

      const lines = output().split('\n');
      expect(lines).toContain(`    - ${id}`);
      // the note of email is there, and nothing of an object is
      expect(output()).toContain(
        '- email: the sender address and the mail transports of the realm go with it'
      );
      expect(output()).not.toMatch(/\[object|function |native code/);
    }
  );

  test.each(PROPERTY_NAMES)(
    'a named dry run of %s says nothing about what a realm commonly depends on',
    async (id) => {
      store.alpha = [service(id)];

      expect(await configManagerDeleteServices(id, 'alpha', true)).toBe(true);

      expect(output()).toContain(`Dry run: Deleting service '${id}'`);
      expect(output()).not.toContain('commonly depends');
      expect(output()).not.toMatch(/\[object|function |native code/);
    }
  );
});

describe('a realm that the tenant lists with a name that is not a realm name', () => {
  test('is one failed operation named realm followed by its name: no request goes to it, and the other realms are processed', async () => {
    realmList.mockResolvedValue(['alpha', '../beta', 'bravo']);
    const realmsRead = [];
    getFullServices.mockReset().mockImplementation(async () => {
      realmsRead.push(realmNow);
      return structuredClone(store[realmNow] ?? []);
    });

    expect(await configManagerDeleteServices()).toBe(false);

    expect(realmsRead).toEqual(['alpha', 'bravo']);
    expect(setRealm.mock.calls.map(([realm]) => realm)).not.toContain(
      '../beta'
    );
    expect(deleted).toEqual([
      'alpha/email',
      'alpha/id-repositories',
      'alpha/session',
      'bravo/session',
      'bravo/validation',
    ]);
    expect(output()).toContain(
      "The realm '../beta' is not '/', a name or a path of names."
    );
    expect(output()).toContain('1 of 6 services failed:');
    expect(output()).toContain(
      "- realm ../beta: The realm '../beta' is not '/', a name or a path of names."
    );
    expect(levelOf('1 of 6 services failed')).toBe('error');
  });

  test('--allow-failures keeps the exit at 0 for it, as for any failed operation', async () => {
    realmList.mockResolvedValue(['../beta', 'alpha']);

    expect(
      await configManagerDeleteServices(undefined, undefined, false, true)
    ).toBe(true);

    expect(deleted).toEqual([
      'alpha/email',
      'alpha/id-repositories',
      'alpha/session',
    ]);
    expect(output()).toContain('- realm ../beta:');
  });

  test('a dry run says how the real run would end: the realm is a failure there too, and no request goes to it', async () => {
    realmList.mockResolvedValue(['../beta', 'alpha']);
    const realmsRead = [];
    getFullServices.mockReset().mockImplementation(async () => {
      realmsRead.push(realmNow);
      return structuredClone(store[realmNow] ?? []);
    });

    expect(await configManagerDeleteServices(undefined, undefined, true)).toBe(
      false
    );

    expect(realmsRead).toEqual(['alpha']);
    expect(output()).toContain('- realm ../beta:');
    expect(deleteFullService).not.toHaveBeenCalled();
  });
});

describe('a plan with ids that are not plain names, shown before a question', () => {
  const plan = { plan: true };

  test('says that the delete stops here, that nothing was asked or deleted, and what can still be done', async () => {
    store.alpha = [service('email'), service('x/y'), service('custom')];

    expect(
      await configManagerDeleteServices(undefined, 'alpha', true, false, plan)
    ).toBe(false);

    expect(deleteFullService).not.toHaveBeenCalled();
    const explained = printMessage.mock.calls.filter(([message]) =>
      String(message).startsWith('Nothing was asked')
    );
    expect(explained).toHaveLength(1);
    expect(explained[0][1]).toBe('error');
    expect(explained[0][0]).toContain('alpha/x/y');
    expect(explained[0][0]).toContain('nothing was deleted');
    expect(explained[0][0]).toContain('-y');
    expect(explained[0][0]).toContain('-i');
    // the plan itself is as it was: the ids that are not plain names are named, the others are listed
    expect(output()).toContain(
      'Plan: 2 services in 1 realm (alpha) would be deleted'
    );
    expect(output()).toContain('1 of 3 services failed:');
  });

  test('says it once for every service that is refused, naming each', async () => {
    store.alpha = [
      service('x/y'),
      service('custom', [['smtpTransports', 'a#b']]),
      service('session'),
    ];

    await configManagerDeleteServices(undefined, 'alpha', true, false, plan);

    const explained = printMessage.mock.calls.filter(([message]) =>
      String(message).startsWith('Nothing was asked')
    );
    expect(explained).toHaveLength(1);
    expect(explained[0][0]).toContain('alpha/x/y');
    expect(explained[0][0]).toContain('alpha/custom/smtpTransports/a#b');
  });

  test('is not said for a plan without such an id, nor for a dry run, which asks nothing in any case', async () => {
    store.alpha = [service('email')];
    await configManagerDeleteServices(undefined, 'alpha', true, false, plan);
    store.alpha = [service('email'), service('x/y')];
    await configManagerDeleteServices(undefined, 'alpha', true);

    expect(output()).not.toContain('Nothing was asked');
  });
});
