import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

/**
 * `frodo config-manager delete applications` (decision record 0042, slice S5 of
 * frodo-cli#1101): the application record first, then the objects it owns, never
 * the shared pieces; an owned object that another application still names is kept;
 * an application whose connector is active is refused naming `frodo app disable`;
 * the record and every owned object are one operation of the run (record 0040),
 * and a named application that cannot be read fails whatever `--allow-failures`
 * says (record 0041).
 *
 * The library is a set of fakes that record the order of their calls. Nothing
 * here touches a tenant, the files of the tree or the home directory.
 */

let deployment;
let currentRealm;
let world;
let calls;
let printed;

const KIND_ORDER = ['oauth2Client', 'saml2Provider', 'mapping', 'connector'];

function sameApplication(owner, record) {
  return owner.applicationId
    ? owner.applicationId === record._id
    : owner.applicationName === record.name;
}

jest.unstable_mockModule('@rockcarver/frodo-lib', () => {
  class FrodoError extends Error {
    constructor(message, original) {
      super(message);
      this.original = original;
    }
  }
  const appsOf = () => world.apps[currentRealm] ?? [];
  return {
    FrodoError,
    state: {
      getDeploymentType: () => deployment,
      setRealm: (realm) => {
        currentRealm = realm;
      },
    },
    frodo: {
      utils: {
        constants: {
          DEFAULT_REALM_KEY: '__default__realm__',
          CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
          FORGEOPS_DEPLOYMENT_TYPE_KEY: 'forgeops',
        },
      },
      realm: {
        readRealms: async () => world.realms.map((name) => ({ name })),
      },
      app: {
        readApplications: jest.fn(async () => {
          calls.push(`readApplications ${currentRealm}`);
          if (world.listFails?.has(currentRealm)) {
            throw new FrodoError(`cannot list ${currentRealm}`);
          }
          return structuredClone(appsOf());
        }),
        readApplicationByName: jest.fn(async (name) => {
          calls.push(`readApplicationByName ${name}`);
          const found = appsOf().find((a) => a.name === name);
          if (!found) throw new FrodoError(`application ${name} not found`);
          return structuredClone(found);
        }),
        readApplicationStatuses: jest.fn(async () => {
          calls.push(`readApplicationStatuses ${currentRealm}`);
          if (world.statusFails) throw new FrodoError('cannot read statuses');
          return appsOf().map((a) => ({
            applicationId: a._id,
            applicationName: a.name,
            connectorId: a.connectorId,
            status: world.status[a._id] ?? 'none',
          }));
        }),
        readApplicationStatus: jest.fn(async (id) => {
          calls.push(`readApplicationStatus ${id}`);
          if (world.statusFails) throw new FrodoError('cannot read status');
          const app = appsOf().find((a) => a._id === id);
          return {
            applicationId: id,
            applicationName: app?.name,
            connectorId: app?.connectorId,
            status: world.status[id] ?? 'none',
          };
        }),
        readApplicationOwnership: jest.fn(async () => {
          calls.push(`readApplicationOwnership ${currentRealm}`);
          if (world.ownershipFails) {
            throw new FrodoError('cannot read the ownership');
          }
          // what the tenant holds now: the applications that still exist name their objects
          const entries = new Map();
          for (const app of appsOf().filter((a) => !world.deleted.has(a._id))) {
            for (const ref of world.refs(app)) {
              const key = `${ref.kind}|${ref.id}`;
              const entry = entries.get(key) ?? {
                kind: ref.kind,
                id: ref.id,
                owners: [],
              };
              entry.owners.push({
                applicationId: app._id,
                applicationName: app.name,
              });
              entries.set(key, entry);
            }
          }
          return { entries: [...entries.values()] };
        }),
        getApplicationRecordReferences: (record) => world.refs(record),
        getApplicationOwners: (ownership, kind, id) =>
          ownership.entries.find((e) => e.kind === kind && e.id === id)
            ?.owners ?? [],
        deleteApplication: jest.fn(async (id, deep) => {
          calls.push(`deleteApplication ${id} deep=${deep}`);
          if (world.recordFails?.has(id)) {
            throw new FrodoError(`cannot delete application ${id}`);
          }
          world.deleted.add(id);
          return { _id: id };
        }),
        deleteApplicationOwnedObjects: jest.fn(async (record, options) => {
          calls.push(`deleteApplicationOwnedObjects ${record.name}`);
          const results = [];
          for (const ref of [...world.refs(record)].sort(
            (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
          )) {
            const others = (
              options.ownership?.entries.find(
                (e) => e.kind === ref.kind && e.id === ref.id
              )?.owners ?? []
            ).filter((owner) => !sameApplication(owner, record));
            let result;
            if (others.length > 0) {
              result = {
                kind: ref.kind,
                id: ref.id,
                outcome: 'kept',
                owners: others,
              };
            } else if (world.objectFails?.has(`${ref.kind}:${ref.id}`)) {
              result = {
                kind: ref.kind,
                id: ref.id,
                outcome: 'failed',
                error: new FrodoError(
                  world.objectFails.get(`${ref.kind}:${ref.id}`)
                ),
              };
            } else {
              calls.push(`  delete ${ref.kind} ${ref.id}`);
              result = { kind: ref.kind, id: ref.id, outcome: 'deleted' };
            }
            results.push(result);
            options.resultCallback?.(result.error, result);
          }
          return results;
        }),
      },
    },
  };
});

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printError: jest.fn((error, message) => {
    printed.push(`ERROR ${message ? `${message}: ` : ''}${error.message}`);
  }),
  printMessage: jest.fn((message, type) => {
    printed.push(`${(type ?? 'text').toUpperCase()} ${message}`);
  }),
  verboseMessage: jest.fn(),
}));

const { configManagerDeleteApplications, showApplicationDeletePlan } =
  await import('../../src/ops/ApplicationConfigDeleteOps');

const ref = (kind, id) => ({ kind, id });

/** An application record with the references it names. */
function app(id, name, refs = [], connectorId) {
  return { _id: id, name, connectorId, __refs: refs };
}

function build(over = {}) {
  return {
    realms: ['alpha'],
    apps: {},
    status: {},
    deleted: new Set(),
    recordFails: new Set(),
    objectFails: new Map(),
    refs: (record) =>
      world.apps[currentRealm]?.find((a) => a._id === record._id)?.__refs ?? [],
    ...over,
  };
}

const output = () => printed.join('\n');
const order = () => calls.filter((c) => !c.startsWith('read'));

beforeEach(() => {
  deployment = 'cloud';
  currentRealm = undefined;
  calls = [];
  printed = [];
  world = build();
});
afterEach(() => {
  jest.clearAllMocks();
});

describe('what a delete does to one application', () => {
  test('deletes the record first and then every owned object, in the order of the library, and never an object that is not owned', async () => {
    world.apps.alpha = [
      app(
        'a1',
        'Zion Portal',
        [
          ref('connector', 'ZionDirectory'),
          ref('mapping', 'systemZion_managedAlpha_user'),
          ref('oauth2Client', 'zion-portal'),
          ref('saml2Provider', 'zion-idp'),
        ],
        'ZionDirectory'
      ),
    ];
    world.status.a1 = 'inactive';

    const outcome = await configManagerDeleteApplications(
      'Zion Portal',
      'alpha'
    );

    expect(outcome).toBe(true);
    expect(order()).toEqual([
      'deleteApplication a1 deep=false',
      'deleteApplicationOwnedObjects Zion Portal',
      '  delete oauth2Client zion-portal',
      '  delete saml2Provider zion-idp',
      '  delete mapping systemZion_managedAlpha_user',
      '  delete connector ZionDirectory',
    ]);
    expect(output()).toContain('Deleted application "Zion Portal"');
    expect(output()).toContain('Deleted OAuth2 client zion-portal');
    expect(output()).not.toContain('failed');
  });

  test('an application with no owned objects is only a record delete, and the ownership is not read', async () => {
    world.apps.alpha = [app('a1', 'Bookmark')];

    const outcome = await configManagerDeleteApplications('Bookmark', 'alpha');

    expect(outcome).toBe(true);
    expect(order()).toEqual(['deleteApplication a1 deep=false']);
    expect(calls.some((c) => c.startsWith('readApplicationOwnership'))).toBe(
      false
    );
  });

  test('an active application is refused naming the way out, and nothing of it is deleted', async () => {
    world.apps.alpha = [
      app(
        'a1',
        'Zion Portal',
        [ref('connector', 'ZionDirectory')],
        'ZionDirectory'
      ),
    ];
    world.status.a1 = 'active';

    const outcome = await configManagerDeleteApplications(
      'Zion Portal',
      'alpha'
    );

    expect(outcome).toBe(false);
    expect(order()).toEqual([]);
    expect(output()).toContain('frodo app disable -n "Zion Portal"');
    expect(output()).toContain('ZionDirectory');
    // one summary names the refused application
    expect(output()).toContain('1 of 1 operation failed');
    expect(output()).toContain('application Zion Portal');
  });

  test('--allow-failures does not delete a refused application either, it only keeps the exit code at 0', async () => {
    world.apps.alpha = [app('a1', 'Zion Portal', [], 'ZionDirectory')];
    world.status.a1 = 'active';

    const outcome = await configManagerDeleteApplications(
      'Zion Portal',
      'alpha',
      false,
      true
    );

    expect(outcome).toBe(true);
    expect(order()).toEqual([]);
    expect(output()).toContain('The exit code stays 0');
  });

  test.each(['inactive', 'none'])(
    'an application with the status %s is deleted',
    async (status) => {
      world.apps.alpha = [
        app('a1', 'Zion Portal', [ref('oauth2Client', 'c1')]),
      ];
      world.status.a1 = status;

      expect(
        await configManagerDeleteApplications('Zion Portal', 'alpha')
      ).toBe(true);
      expect(order()[0]).toBe('deleteApplication a1 deep=false');
    }
  );

  test('when the record cannot be deleted, nothing it owns is touched', async () => {
    world.apps.alpha = [app('a1', 'Zion Portal', [ref('oauth2Client', 'c1')])];
    world.recordFails.add('a1');

    const outcome = await configManagerDeleteApplications(
      'Zion Portal',
      'alpha'
    );

    expect(outcome).toBe(false);
    expect(order()).toEqual(['deleteApplication a1 deep=false']);
    expect(output()).toContain('application Zion Portal');
    expect(output()).toContain('cannot delete application a1');
  });
});

describe('owned objects that other applications name, and objects that fail', () => {
  test('an object another application still names is kept, reported, and not a failure', async () => {
    world.apps.alpha = [
      app('a1', 'Zion Portal', [
        ref('connector', 'Shared'),
        ref('oauth2Client', 'c1'),
      ]),
      app('a2', 'Neo Portal', [ref('connector', 'Shared')]),
    ];

    const outcome = await configManagerDeleteApplications(
      'Zion Portal',
      'alpha'
    );

    expect(outcome).toBe(true);
    expect(order()).toEqual([
      'deleteApplication a1 deep=false',
      'deleteApplicationOwnedObjects Zion Portal',
      '  delete oauth2Client c1',
    ]);
    expect(output()).toContain(
      'Kept connector Shared: it is also used by application "Neo Portal"'
    );
    expect(output()).not.toContain('failed');
  });

  test('a failing object is a named failure and the other objects are still deleted', async () => {
    world.apps.alpha = [
      app('a1', 'Zion Portal', [
        ref('oauth2Client', 'c1'),
        ref('saml2Provider', 'idp1'),
        ref('connector', 'Dir'),
      ]),
    ];
    world.objectFails.set(
      'saml2Provider:idp1',
      'SAML provider idp1 was deleted, but it could not be removed from its circles of trust'
    );

    const outcome = await configManagerDeleteApplications(
      'Zion Portal',
      'alpha'
    );

    expect(outcome).toBe(false);
    expect(order()).toEqual([
      'deleteApplication a1 deep=false',
      'deleteApplicationOwnedObjects Zion Portal',
      '  delete oauth2Client c1',
      '  delete connector Dir',
    ]);
    expect(output()).toContain('1 of 4 operations failed');
    expect(output()).toContain('application Zion Portal: SAML provider idp1');
    expect(output()).toContain(
      'could not be removed from its circles of trust'
    );
  });

  test('--allow-failures prints the same summary and exits 0', async () => {
    world.apps.alpha = [app('a1', 'Zion Portal', [ref('oauth2Client', 'c1')])];
    world.objectFails.set('oauth2Client:c1', 'cannot delete c1');

    const outcome = await configManagerDeleteApplications(
      'Zion Portal',
      'alpha',
      false,
      true
    );

    expect(outcome).toBe(true);
    expect(output()).toContain('1 of 2 operations failed');
    expect(output()).toContain('The exit code stays 0');
  });

  test('an ownership that cannot be read leaves the objects alone, and the record is gone', async () => {
    world.apps.alpha = [app('a1', 'Zion Portal', [ref('oauth2Client', 'c1')])];
    world.ownershipFails = true;

    const outcome = await configManagerDeleteApplications(
      'Zion Portal',
      'alpha'
    );

    expect(outcome).toBe(false);
    expect(order()).toEqual(['deleteApplication a1 deep=false']);
    expect(output()).toContain('application Zion Portal: the objects it owns');
  });
});

describe('deleting several applications', () => {
  test('an object that only applications of this run share is deleted with the last of them', async () => {
    // the ownership is read once, while all three still exist: the index
    // must forget each application as it is deleted
    world.apps.alpha = [
      app('a1', 'A Portal', [ref('oauth2Client', 'first')]),
      app('a2', 'B Portal', [
        ref('connector', 'Shared'),
        ref('oauth2Client', 'second'),
      ]),
      app('a3', 'C Portal', [
        ref('connector', 'Shared'),
        ref('oauth2Client', 'third'),
      ]),
    ];

    const outcome = await configManagerDeleteApplications(undefined, 'alpha');

    expect(outcome).toBe(true);
    // B goes before C: C still names the connector, so B keeps it. C goes last and takes it.
    expect(order()).toEqual([
      'deleteApplication a1 deep=false',
      'deleteApplicationOwnedObjects A Portal',
      '  delete oauth2Client first',
      'deleteApplication a2 deep=false',
      'deleteApplicationOwnedObjects B Portal',
      '  delete oauth2Client second',
      'deleteApplication a3 deep=false',
      'deleteApplicationOwnedObjects C Portal',
      '  delete oauth2Client third',
      '  delete connector Shared',
    ]);
    expect(output()).toContain(
      'Kept connector Shared: it is also used by application "C Portal"'
    );
  });

  test('a refused application stays an owner: the object it shares is kept by the others', async () => {
    world.apps.alpha = [
      app('a1', 'Neo Portal', [ref('connector', 'Shared')]),
      app('a2', 'Zion Portal', [ref('connector', 'Shared')], 'Shared'),
    ];
    world.status.a2 = 'active';

    const outcome = await configManagerDeleteApplications(undefined, 'alpha');

    expect(outcome).toBe(false);
    expect(order()).toEqual([
      'deleteApplication a1 deep=false',
      'deleteApplicationOwnedObjects Neo Portal',
    ]);
    expect(output()).toContain('1 of 3 operations failed');
  });

  test('one failing application does not stop the others, and one summary names it', async () => {
    world.apps.alpha = [
      app('a1', 'Neo Portal', [ref('oauth2Client', 'neo')]),
      app('a2', 'Zion Portal', [ref('oauth2Client', 'zion')]),
    ];
    world.recordFails.add('a1');

    const outcome = await configManagerDeleteApplications(undefined, 'alpha');

    expect(outcome).toBe(false);
    expect(order()).toEqual([
      'deleteApplication a1 deep=false',
      'deleteApplication a2 deep=false',
      'deleteApplicationOwnedObjects Zion Portal',
      '  delete oauth2Client zion',
    ]);
    expect(output()).toContain('1 of 3 operations failed');
    expect(output()).toContain('application Neo Portal');
  });

  test('the ownership is read once for the realm, however many applications there are', async () => {
    world.apps.alpha = [
      app('a1', 'A', [ref('oauth2Client', 'a')]),
      app('a2', 'B', [ref('oauth2Client', 'b')]),
      app('a3', 'C', [ref('oauth2Client', 'c')]),
    ];

    await configManagerDeleteApplications(undefined, 'alpha');

    expect(
      calls.filter((c) => c.startsWith('readApplicationOwnership')).length
    ).toBe(1);
  });

  test('the applications and their status are read once for the whole realm', async () => {
    world.apps.alpha = [app('a1', 'A'), app('a2', 'B')];

    await configManagerDeleteApplications(undefined, 'alpha');

    expect(calls.filter((c) => c.startsWith('readApplications ')).length).toBe(
      1
    );
    expect(
      calls.filter((c) => c.startsWith('readApplicationStatuses')).length
    ).toBe(1);
    expect(calls.some((c) => c.startsWith('readApplicationStatus a'))).toBe(
      false
    );
  });

  test('nothing to delete is success', async () => {
    world.apps.alpha = [];

    expect(await configManagerDeleteApplications(undefined, 'alpha')).toBe(
      true
    );
    expect(output()).toContain('No applications found to delete.');
    expect(order()).toEqual([]);
  });
});

describe('the dry run', () => {
  test('shows the plan and deletes nothing', async () => {
    world.apps.alpha = [
      app('a1', 'Neo Portal', [
        ref('connector', 'Shared'),
        ref('oauth2Client', 'neo'),
      ]),
      app('a2', 'Zion Portal', [
        ref('connector', 'Shared'),
        ref('oauth2Client', 'zion'),
      ]),
    ];

    const outcome = await configManagerDeleteApplications(
      undefined,
      'alpha',
      true
    );

    expect(outcome).toBe(true);
    expect(order()).toEqual([]);
    expect(output()).toContain(
      'Dry run: application "Neo Portal" in realm alpha would be deleted'
    );
    expect(output()).toContain('OAuth2 client neo: deleted');
    // as the run does it: the last of the two takes the shared connector
    expect(output()).toContain(
      'connector Shared: kept, it is also used by application "Zion Portal"'
    );
    expect(output()).toContain('connector Shared: deleted');
  });

  test('says that an active application would be refused, and the preview exits 1 like the run', async () => {
    world.apps.alpha = [app('a1', 'Zion Portal', [], 'ZionDirectory')];
    world.status.a1 = 'active';

    const outcome = await configManagerDeleteApplications(
      undefined,
      'alpha',
      true
    );

    expect(outcome).toBe(false);
    expect(order()).toEqual([]);
    expect(output()).toContain('would NOT be deleted');
    expect(output()).toContain('frodo app disable -n "Zion Portal"');
    expect(output()).toContain('1 application would be refused');
  });

  test('with --allow-failures the preview of a refused application exits 0', async () => {
    world.apps.alpha = [app('a1', 'Zion Portal', [], 'ZionDirectory')];
    world.status.a1 = 'active';

    expect(
      await configManagerDeleteApplications(undefined, 'alpha', true, true)
    ).toBe(true);
  });

  test('the plan that comes before the question shows a refused application and still succeeds', async () => {
    world.apps.alpha = [app('a1', 'Zion Portal', [], 'ZionDirectory')];
    world.status.a1 = 'active';

    expect(await showApplicationDeletePlan(undefined, 'alpha')).toBe(true);
    expect(output()).toContain('would NOT be deleted');
    expect(order()).toEqual([]);
  });

  test('the plan fails when the applications cannot be read', async () => {
    world.apps.alpha = [];
    world.listFails = new Set(['alpha']);

    expect(await showApplicationDeletePlan(undefined, 'alpha')).toBe(false);
  });
});

describe('which realms and which applications', () => {
  test('a name needs a single realm', async () => {
    world.realms = ['alpha', 'bravo'];

    const outcome = await configManagerDeleteApplications('Zion Portal');

    expect(outcome).toBe(false);
    expect(output()).toContain(
      'for a named application, specify a single realm'
    );
    expect(order()).toEqual([]);
  });

  test.each([false, true])(
    'a named application that does not exist exits 1 whatever --allow-failures says (allow=%s)',
    async (allowFailures) => {
      world.apps.alpha = [app('a1', 'Neo Portal')];

      const outcome = await configManagerDeleteApplications(
        'Zion Portal',
        'alpha',
        false,
        allowFailures
      );

      expect(outcome).toBe(false);
      expect(order()).toEqual([]);
      expect(output()).toContain("application 'Zion Portal' in realm 'alpha'");
    }
  );

  test('a realm of its own is the only one that is touched', async () => {
    world.realms = ['alpha', 'bravo'];
    world.apps.alpha = [app('a1', 'Alpha App')];
    world.apps.bravo = [app('b1', 'Bravo App')];

    expect(await configManagerDeleteApplications(undefined, 'bravo')).toBe(
      true
    );

    expect(calls.filter((c) => c.startsWith('deleteApplication '))).toEqual([
      'deleteApplication b1 deep=false',
    ]);
  });

  test('the default realm key means every realm', async () => {
    world.realms = ['alpha', 'bravo'];
    world.apps.alpha = [app('a1', 'Alpha App')];
    world.apps.bravo = [app('b1', 'Bravo App')];

    expect(
      await configManagerDeleteApplications(undefined, '__default__realm__')
    ).toBe(true);

    expect(calls.filter((c) => c.startsWith('deleteApplication '))).toEqual([
      'deleteApplication a1 deep=false',
      'deleteApplication b1 deep=false',
    ]);
  });

  test('without a realm every realm is taken, and the root realm of a Cloud tenant is skipped', async () => {
    world.realms = ['/', 'alpha', 'bravo'];
    world.apps['/'] = [app('r1', 'Root App')];
    world.apps.alpha = [app('a1', 'Alpha App')];
    world.apps.bravo = [app('b1', 'Bravo App')];

    const outcome = await configManagerDeleteApplications();

    expect(outcome).toBe(true);
    expect(calls.filter((c) => c.startsWith('deleteApplication '))).toEqual([
      'deleteApplication a1 deep=false',
      'deleteApplication b1 deep=false',
    ]);
    expect(calls).not.toContain('readApplications /');
  });

  test('with more than one realm the summary names the realm of the application that failed', async () => {
    world.realms = ['alpha', 'bravo'];
    world.apps.alpha = [app('a1', 'Alpha App')];
    world.apps.bravo = [app('b1', 'Bravo App')];
    world.recordFails.add('b1');

    const outcome = await configManagerDeleteApplications();

    expect(outcome).toBe(false);
    expect(calls).toContain('deleteApplication a1 deep=false');
    expect(output()).toContain('application Bravo App in realm bravo');
    expect(output()).toContain('1 of 2 operations failed');
  });

  test('on ForgeOps the root realm is not skipped', async () => {
    deployment = 'forgeops';
    world.realms = ['/', 'alpha'];
    world.apps['/'] = [app('r1', 'Root App')];
    world.apps.alpha = [];

    await configManagerDeleteApplications();

    expect(calls).toContain('deleteApplication r1 deep=false');
  });

  test('a realm whose applications cannot be read ends the command and nothing is deleted there', async () => {
    world.realms = ['alpha', 'bravo'];
    world.apps.alpha = [app('a1', 'Alpha App')];
    world.apps.bravo = [app('b1', 'Bravo App')];
    world.listFails = new Set(['bravo']);

    const outcome = await configManagerDeleteApplications(
      undefined,
      undefined,
      false,
      true
    );

    expect(outcome).toBe(false);
    expect(calls).not.toContain('deleteApplication b1 deep=false');
  });

  test('a status that cannot be read deletes nothing, even with --allow-failures', async () => {
    world.apps.alpha = [app('a1', 'Zion Portal', [ref('oauth2Client', 'c1')])];
    world.statusFails = true;

    const outcome = await configManagerDeleteApplications(
      'Zion Portal',
      'alpha',
      false,
      true
    );

    expect(outcome).toBe(false);
    expect(order()).toEqual([]);
  });

  test('a named application is looked up by name and its status by id', async () => {
    world.apps.alpha = [app('a1', 'Zion Portal'), app('a2', 'Neo Portal')];

    await configManagerDeleteApplications('Zion Portal', 'alpha');

    expect(calls).toContain('readApplicationByName Zion Portal');
    expect(calls).toContain('readApplicationStatus a1');
    expect(calls.some((c) => c.startsWith('readApplications '))).toBe(false);
    expect(order()).toEqual(['deleteApplication a1 deep=false']);
  });
});
