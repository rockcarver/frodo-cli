/**
 * Unit tests for `remote-proxy setup` and `teardown` (src/ops/RemoteProxyWorkflowOps.ts)
 * without a tenant: both tenants are in-memory fakes, so what is asserted is what the
 * workflow decides: the order of the steps, that a second run changes nothing, that one
 * secret goes to both tenants and is never printed, that the ESV apply is not used to
 * apply somebody else's pending changes, and that a teardown removes only what is its own.
 * The real import graph pulls in all of frodo-lib, whose bundled ESM cannot load under
 * jest's ESM runtime, so the facade, the console and the guards are mocked first.
 */
import { jest } from '@jest/globals';

const SENDER = 'https://openam-matrix.id.forgerock.io/am';
const RECEIVER = 'https://openam-zion.id.forgerock.io/am';
const SECRET_ID = 'esv-remote-proxy-zion';
const HOST_VARIABLE_ID = 'esv-remote-proxy-zion-host';

let world;
const calls = [];
const printed = [];
const messages = (type) =>
  printed.filter((entry) => entry.type === type).map((entry) => entry.msg);
const everythingPrinted = () => printed.map((entry) => entry.msg).join('\n');

const notFound = (what) =>
  Object.assign(new Error(`${what} not found`), { httpStatus: 404 });
const placeholder = (id) => `&{${id.replaceAll('-', '.')}}`;

function freshWorld() {
  return {
    receiver: {
      host: RECEIVER,
      clients: new Map(),
      mappings: new Map(),
      loginFails: false,
    },
    sender: {
      secrets: new Map(),
      variables: new Map(),
      proxies: new Map(),
      pending: new Set(),
      otherPending: [],
      deleteRefusals: { variable: 0, secret: 0 },
      deleteFailure: undefined,
    },
    generated: 0,
    testResults: [],
    applyResult: true,
    guard: { proceed: true, bulk: true },
  };
}

const okResult = {
  ok: true,
  status: 'ok',
  httpStatus: 200,
  authenticationId: 'openidm-admin',
  roles: ['internal/role/openidm-admin', 'internal/role/openidm-authorized'],
  message: 'ok',
};

function receiverFacade() {
  const r = world.receiver;
  return {
    state: {
      getHost: () => world.receiver.host,
      setDebug: () => {},
      setVerbose: () => {},
      setCurlirize: () => {},
      setAllowInsecureConnection: () => {},
      setUseTokenCache: () => {},
    },
    login: {
      getTokens: async () => {
        calls.push('receiver:login');
        if (r.loginFails) throw new Error('login refused');
      },
    },
    oauth2oidc: {
      client: {
        readOAuth2Client: async (id) => {
          if (!r.clients.has(id)) throw notFound(`client ${id}`);
          return structuredClone(r.clients.get(id));
        },
        createOAuth2Client: async (id, data) => {
          calls.push(`receiver:createClient:${id}`);
          r.clients.set(id, structuredClone(data));
          return data;
        },
        updateOAuth2Client: async (id, data) => {
          calls.push(`receiver:updateClient:${id}`);
          r.clients.set(id, structuredClone(data));
          return data;
        },
        deleteOAuth2Client: async (id) => {
          calls.push(`receiver:deleteClient:${id}`);
          r.clients.delete(id);
        },
      },
    },
    idm: {
      staticUserMapping: {
        readStaticUserMappings: async () => [...r.mappings.values()],
        ensureStaticUserMapping: async (mapping) => {
          const had = r.mappings.has(mapping.subject);
          if (!had) calls.push(`receiver:createMapping:${mapping.subject}`);
          r.mappings.set(mapping.subject, mapping);
          return { mapping, outcome: had ? 'unchanged' : 'created' };
        },
        deleteStaticUserMapping: async (subject) => {
          calls.push(`receiver:deleteMapping:${subject}`);
          r.mappings.delete(subject);
        },
      },
    },
  };
}

const remoteProxy = {
  isValidRemoteProxyName: (name) =>
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name),
  generateRemoteProxySecret: () =>
    `generated-secret-${++world.generated}-0123456789abcdef`,
  buildRemoteProxyClient: ({ clientId, clientSecret, description }) => ({
    coreOAuth2ClientConfig: {
      clientName: { value: [clientId] },
      userpassword: clientSecret,
    },
    description,
  }),
  buildRemoteProxyConfiguration: ({
    receiverHost,
    clientId,
    secretId,
    hostVariableId,
    realm = 'alpha',
  }) => {
    const base = hostVariableId
      ? `https://${placeholder(hostVariableId)}`
      : new URL(receiverHost).origin;
    return {
      enabled: true,
      authType: 'bearer',
      instanceUrl: `${base}/openidm/`,
      clientId,
      clientSecret: placeholder(secretId),
      scope: ['fr:idm:*'],
      tokenEndpoint: `${base}/am/oauth2/realms/root/realms/${realm}/access_token`,
      tokenEndpointAuthMethod: 'client_secret_post',
      scopeDelimiter: ' ',
    };
  },
  readRemoteProxy: async (name) => {
    if (!world.sender.proxies.has(name)) throw notFound(`proxy ${name}`);
    return structuredClone(world.sender.proxies.get(name));
  },
  readRemoteProxies: async () =>
    [...world.sender.proxies.values()].map((p) => structuredClone(p)),
  createRemoteProxy: async (name, data) => {
    calls.push(`sender:createProxy:${name}`);
    world.sender.proxies.set(name, {
      _id: `external.idm/${name}`,
      ...structuredClone(data),
    });
  },
  updateRemoteProxy: async (name, data) => {
    calls.push(`sender:updateProxy:${name}`);
    world.sender.proxies.set(name, {
      _id: `external.idm/${name}`,
      ...structuredClone(data),
    });
  },
  deleteRemoteProxy: async (name) => {
    calls.push(`sender:deleteProxy:${name}`);
    world.sender.proxies.delete(name);
  },
  testRemoteProxy: async () => {
    calls.push('sender:test');
    return world.testResults.length > 0 ? world.testResults.shift() : okResult;
  },
};

const cloud = {
  secret: {
    readSecret: async (id) => {
      if (!world.sender.secrets.has(id)) throw notFound(`secret ${id}`);
      return { _id: id };
    },
    createSecret: async (
      id,
      value,
      description,
      encoding,
      useInPlaceholders
    ) => {
      calls.push(`sender:createSecret:${id}`);
      world.sender.secrets.set(id, { value, encoding, useInPlaceholders });
      world.sender.pending.add(id);
    },
    updateSecret: async (id, description, value) => {
      calls.push(`sender:updateSecret:${id}`);
      world.sender.secrets.get(id).value = value;
      world.sender.pending.add(id);
    },
    deleteSecret: async (id) => {
      if (world.sender.deleteFailure) throw world.sender.deleteFailure;
      if (world.sender.deleteRefusals.secret > 0) {
        world.sender.deleteRefusals.secret -= 1;
        throw refusedBecauseUsed('secret', id);
      }
      calls.push(`sender:deleteSecret:${id}`);
      world.sender.secrets.delete(id);
    },
  },
  variable: {
    readVariable: async (id) => {
      if (!world.sender.variables.has(id)) throw notFound(`variable ${id}`);
      return { _id: id, value: world.sender.variables.get(id) };
    },
    createVariable: async (id, value) => {
      calls.push(`sender:createVariable:${id}`);
      world.sender.variables.set(id, value);
      world.sender.pending.add(id);
    },
    updateVariable: async (id, value) => {
      calls.push(`sender:updateVariable:${id}`);
      world.sender.variables.set(id, value);
      world.sender.pending.add(id);
    },
    deleteVariable: async (id) => {
      if (world.sender.deleteFailure) throw world.sender.deleteFailure;
      if (world.sender.deleteRefusals.variable > 0) {
        world.sender.deleteRefusals.variable -= 1;
        throw (
          world.sender.refusalError?.(id) ?? refusedBecauseUsed('variable', id)
        );
      }
      calls.push(`sender:deleteVariable:${id}`);
      world.sender.variables.delete(id);
    },
  },
  startup: {
    checkForUpdates: async () => {
      const mine = [...world.sender.pending].map((_id) => ({
        _id,
        loaded: false,
      }));
      const others = world.sender.otherPending.map((_id) => ({
        _id,
        loaded: false,
      }));
      return {
        secrets: [...mine, ...others].filter(
          (x) => x._id.includes('secret') && !x._id.endsWith('-host')
        ),
        variables: [...mine, ...others].filter(
          (x) => !(x._id.includes('secret') && !x._id.endsWith('-host'))
        ),
      };
    },
    applyUpdates: async (wait, timeoutMs) => {
      calls.push(`sender:apply:wait=${wait}:timeout=${timeoutMs}`);
      if (world.applyResult) {
        world.sender.pending.clear();
        world.sender.otherPending = [];
      }
      return world.applyResult;
    },
  },
};

/** Like the real one: the reason of a failed request is in the error it wraps, not in `message`. */
class FakeFrodoError extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.httpStatus = cause?.httpStatus;
    this.httpMessage = cause?.response?.data?.message;
  }

  getCombinedMessage() {
    return [
      this.message,
      this.cause?.message,
      this.httpMessage && `Message: ${this.httpMessage}`,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

/** What IDM answers while a deleted proxy still counts as using an ESV variable. */
const refusedBecauseUsed = (what, id) =>
  new FakeFrodoError(
    `Error deleting ${what} ${id}`,
    Object.assign(new Error('Request failed with status code 403'), {
      httpStatus: 403,
      response: {
        data: {
          message: `Cannot delete a ${what} that has an existing config placeholder`,
        },
      },
    })
  );

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError: FakeFrodoError,
  frodo: {
    utils: { constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' } },
    createInstance: () => receiverFacade(),
    idm: { remoteProxy },
    cloud,
  },
  state: {
    getHost: () => SENDER,
    getDebug: () => false,
    getVerbose: () => false,
    getCurlirize: () => false,
    getAllowInsecureConnection: () => false,
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => printed.push({ msg: String(msg), type }),
  printError: (error) =>
    printed.push({
      msg: String(error?.getCombinedMessage?.() ?? error?.message ?? error),
      type: 'error',
    }),
  createTable: () => {
    const rows = [];
    return {
      push: (row) => rows.push(row),
      toString: () => rows.map((row) => row.join(' | ')).join('\n'),
    };
  },
  showSpinner: (msg) => printed.push({ msg: String(msg), type: 'spinner' }),
  succeedSpinner: (msg) =>
    printed.push({ msg: String(msg), type: 'spinner-ok' }),
  failSpinner: (msg) =>
    printed.push({ msg: String(msg), type: 'spinner-fail' }),
}));

jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: { heading: (t) => t, positive: (t) => t, negative: (t) => t },
}));

const guardCalls = [];
jest.unstable_mockModule('../../src/utils/BulkDeleteGuard', () => ({
  checkProceed: (args) => {
    guardCalls.push({ fn: 'checkProceed', ...args });
    return true;
  },
  checkBulkDelete: (args) => {
    guardCalls.push({ fn: 'checkBulkDelete', ...args });
    return true;
  },
  confirmProceed: async (args) => {
    guardCalls.push({ fn: 'confirmProceed', ...args });
    if (args.showPlan) await args.showPlan();
    return world.guard.proceed;
  },
  confirmBulkDelete: async (args) => {
    guardCalls.push({ fn: 'confirmBulkDelete', ...args });
    if (args.showPlan) await args.showPlan();
    return world.guard.bulk;
  },
}));

let savedProfileByHostName;
jest.unstable_mockModule('../../src/utils/SavedProfiles', () => ({
  findSavedProfileByHostName: (hostName) => savedProfileByHostName?.(hostName),
}));

const {
  setupRemoteProxy,
  teardownRemoteProxy,
  tenantNameOf,
  hostNameOf,
  remoteProxyEsvIds,
  waitUntilRemoteProxyAnswers,
  ADMIN_STATIC_MAPPING,
} = await import('../../src/ops/RemoteProxyWorkflowOps.ts');

/** A clock that only moves when the code sleeps. */
function fakeClock() {
  let time = 0;
  const slept = [];
  return {
    slept,
    deps: {
      now: () => time,
      sleep: async (ms) => {
        slept.push(ms);
        time += ms;
      },
    },
  };
}

const SETUP = { target: RECEIVER, yes: true };

beforeEach(() => {
  world = freshWorld();
  calls.length = 0;
  printed.length = 0;
  guardCalls.length = 0;
  savedProfileByHostName = undefined;
});

/** What a finished setup leaves on both tenants. */
async function runSetup(options = {}) {
  const clock = fakeClock();
  const outcome = await setupRemoteProxy({ ...SETUP, ...options }, clock.deps);
  return { outcome, clock };
}

describe('names', () => {
  test('the name of a tenant is the part of its host after openam-', () => {
    expect(tenantNameOf('https://openam-zion.id.forgerock.io/am')).toBe('zion');
    expect(tenantNameOf('https://openam-my-tenant.forgeblocks.com')).toBe(
      'my-tenant'
    );
    expect(tenantNameOf('https://zion.example.com/am')).toBe('zion');
  });

  test('the ESV variable holds the host name only', () => {
    expect(hostNameOf(RECEIVER)).toBe('openam-zion.id.forgerock.io');
  });

  test('the ESV ids follow from the name of the proxy, in ESV form', () => {
    expect(remoteProxyEsvIds('zion')).toEqual({
      secretId: SECRET_ID,
      hostVariableId: HOST_VARIABLE_ID,
    });
    expect(remoteProxyEsvIds('My_Proxy.2')).toEqual({
      secretId: 'esv-remote-proxy-my-proxy-2',
      hostVariableId: 'esv-remote-proxy-my-proxy-2-host',
    });
  });

  test('a name with no letter or digit cannot make ESV ids', () => {
    expect(() => remoteProxyEsvIds('---')).toThrow('no letters or digits');
  });
});

describe('setup on two empty tenants', () => {
  test('creates the client and mapping on the receiver, then the ESV secret, variable and proxy, applies once and tests', async () => {
    const { outcome } = await runSetup();

    expect(outcome).toBe(true);
    expect(calls).toEqual([
      'receiver:login',
      'receiver:createClient:frodo-remote-proxy-matrix',
      'receiver:createMapping:frodo-remote-proxy-matrix',
      `sender:createSecret:${SECRET_ID}`,
      `sender:createVariable:${HOST_VARIABLE_ID}`,
      'sender:createProxy:zion',
      'sender:apply:wait=true:timeout=600000',
      'sender:test',
      'sender:test',
      'sender:test',
    ]);
  });

  test('puts the one generated secret on the client and in the ESV secret, usable in placeholders', async () => {
    await runSetup();

    const clientSecret = world.receiver.clients.get('frodo-remote-proxy-matrix')
      .coreOAuth2ClientConfig.userpassword;
    expect(clientSecret).toMatch(/^generated-secret-/);
    expect(world.sender.secrets.get(SECRET_ID)).toEqual({
      value: clientSecret,
      encoding: 'generic',
      useInPlaceholders: true,
    });
  });

  test('never prints the secret', async () => {
    await runSetup();

    const secret = world.sender.secrets.get(SECRET_ID).value;
    expect(everythingPrinted()).not.toContain(secret);
    expect(JSON.stringify(guardCalls)).not.toContain(secret);
  });

  test('writes the receiving tenant as ESV placeholders so that the proxy can be promoted', async () => {
    await runSetup();

    expect(world.sender.variables.get(HOST_VARIABLE_ID)).toBe(
      'openam-zion.id.forgerock.io'
    );
    const proxy = world.sender.proxies.get('zion');
    expect(proxy.instanceUrl).toBe(
      'https://&{esv.remote.proxy.zion.host}/openidm/'
    );
    expect(proxy.tokenEndpoint).toBe(
      'https://&{esv.remote.proxy.zion.host}/am/oauth2/realms/root/realms/alpha/access_token'
    );
    expect(proxy.clientSecret).toBe('&{esv.remote.proxy.zion}');
    expect(JSON.stringify(proxy)).not.toContain('openam-zion');
  });

  test('gives the client the documented administrator mapping', async () => {
    await runSetup();

    expect(world.receiver.mappings.get('frodo-remote-proxy-matrix')).toEqual({
      subject: 'frodo-remote-proxy-matrix',
      ...ADMIN_STATIC_MAPPING,
    });
    expect(ADMIN_STATIC_MAPPING.localUser).toBe('internal/user/openidm-admin');
  });

  test('shows who the proxy acts as when it answers', async () => {
    await runSetup();

    const out = messages('data').join('\n');
    expect(out).toContain('openidm-admin');
    expect(out).toContain(RECEIVER);
  });

  test('takes the names from the options when they are given', async () => {
    await runSetup({
      proxyId: 'my-zion',
      clientId: 'my-client',
      targetRealm: 'bravo',
    });

    expect(world.receiver.clients.has('my-client')).toBe(true);
    expect(world.sender.proxies.get('my-zion').clientId).toBe('my-client');
    expect(world.sender.proxies.get('my-zion').tokenEndpoint).toContain(
      '/realms/bravo/access_token'
    );
    expect(world.sender.secrets.has('esv-remote-proxy-my-zion')).toBe(true);
  });

  test('asks first, saying what it gives away and what the apply costs', async () => {
    await runSetup({ yes: false });

    const ask = guardCalls.find((c) => c.fn === 'confirmProceed');
    expect(ask.what).toContain('set up the remote proxy "zion"');
    expect(ask.warning).toContain('rights of the IDM administrator');
    expect(ask.warning).toContain('restarts services');
  });
});

describe('setup stops before it changes anything', () => {
  test('a dry run shows the plan on both tenants and writes nothing', async () => {
    const { outcome } = await runSetup({ dryRun: true, yes: false });

    expect(outcome).toBe(true);
    expect(calls).toEqual(['receiver:login']);
    const plan = messages('data').join('\n');
    expect(plan).toContain(
      `OAuth2 client "frodo-remote-proxy-matrix" | create`
    );
    expect(plan).toContain(`ESV secret "${SECRET_ID}" | create`);
    expect(plan).toContain(`remote proxy "zion" | create`);
    expect(guardCalls.find((c) => c.fn === 'confirmProceed')).toBeUndefined();
  });

  test('a no to the question changes nothing', async () => {
    world.guard.proceed = false;

    const { outcome } = await runSetup({ yes: false });

    expect(outcome).toBe(false);
    expect(calls).toEqual(['receiver:login']);
  });

  test('a receiving tenant that cannot be logged in to is reported and nothing is changed', async () => {
    world.receiver.loginFails = true;

    const { outcome } = await runSetup();

    expect(outcome).toBe(false);
    expect(messages('error').join('\n')).toContain(
      'Error connecting to the receiving tenant'
    );
    expect(calls).toEqual(['receiver:login']);
  });

  test('a name the library refuses is reported before anything is written', async () => {
    const { outcome } = await runSetup({ proxyId: 'a/b' });

    expect(outcome).toBe(false);
    expect(messages('error').join('\n')).toContain('"a/b" is not allowed');
    expect(calls).toEqual(['receiver:login']);
  });

  test('a proxy from a tenant to itself is refused, and nothing is written', async () => {
    world.receiver.host = SENDER;

    const { outcome } = await runSetup();

    expect(outcome).toBe(false);
    expect(messages('error').join('\n')).toContain(
      'connects two different tenants'
    );
    expect(calls).toEqual(['receiver:login']);
  });
});

describe('setup run a second time', () => {
  test('changes nothing when everything is there', async () => {
    await runSetup();
    calls.length = 0;
    printed.length = 0;
    const secretBefore = world.sender.secrets.get(SECRET_ID).value;

    const { outcome } = await runSetup();

    expect(outcome).toBe(true);
    expect(calls).toEqual([
      'receiver:login',
      'sender:test',
      'sender:test',
      'sender:test',
    ]);
    expect(world.sender.secrets.get(SECRET_ID).value).toBe(secretBefore);
    expect(world.generated).toBe(1);
  });

  test('writes a new secret to both sides when the client is gone but the ESV secret is there', async () => {
    await runSetup();
    world.receiver.clients.clear();
    calls.length = 0;

    await runSetup();

    const clientSecret = world.receiver.clients.get('frodo-remote-proxy-matrix')
      .coreOAuth2ClientConfig.userpassword;
    expect(world.sender.secrets.get(SECRET_ID).value).toBe(clientSecret);
    expect(calls).toContain('receiver:createClient:frodo-remote-proxy-matrix');
    expect(calls).toContain(`sender:updateSecret:${SECRET_ID}`);
    expect(calls).not.toContain(`sender:createSecret:${SECRET_ID}`);
  });

  test('writes a new secret to both sides when the ESV secret is gone but the client is there', async () => {
    await runSetup();
    world.sender.secrets.clear();
    calls.length = 0;

    await runSetup();

    const clientSecret = world.receiver.clients.get('frodo-remote-proxy-matrix')
      .coreOAuth2ClientConfig.userpassword;
    expect(world.sender.secrets.get(SECRET_ID).value).toBe(clientSecret);
    expect(calls).toContain('receiver:updateClient:frodo-remote-proxy-matrix');
    expect(calls).toContain(`sender:createSecret:${SECRET_ID}`);
  });

  test('rotates the secret on both sides only when asked', async () => {
    await runSetup();
    const before = world.sender.secrets.get(SECRET_ID).value;
    calls.length = 0;

    await runSetup({ rotateSecret: true });

    const after = world.sender.secrets.get(SECRET_ID).value;
    expect(after).not.toBe(before);
    expect(
      world.receiver.clients.get('frodo-remote-proxy-matrix')
        .coreOAuth2ClientConfig.userpassword
    ).toBe(after);
  });

  test('updates a proxy whose configuration differs', async () => {
    await runSetup();
    world.sender.proxies.get('zion').instanceUrl =
      'https://elsewhere.example.com/openidm/';
    calls.length = 0;

    await runSetup();

    expect(calls).toContain('sender:updateProxy:zion');
  });

  test('updates the ESV variable when the receiving tenant moved', async () => {
    await runSetup();
    world.sender.variables.set(HOST_VARIABLE_ID, 'old-host.example.com');
    calls.length = 0;

    await runSetup();

    expect(calls).toContain(`sender:updateVariable:${HOST_VARIABLE_ID}`);
    expect(world.sender.variables.get(HOST_VARIABLE_ID)).toBe(
      'openam-zion.id.forgerock.io'
    );
  });
});

describe('setup and the ESV apply', () => {
  test('does not apply with --no-apply, and says what to do next', async () => {
    const { outcome } = await runSetup({ apply: false });

    expect(outcome).toBe(true);
    expect(calls.some((c) => c.startsWith('sender:apply'))).toBe(false);
    expect(calls).not.toContain('sender:test');
    expect(messages('info').join('\n')).toContain('frodo esv apply');
    expect(messages('info').join('\n')).toContain(
      'frodo idm remote-proxy test -i zion'
    );
  });

  test("does not apply other people's pending changes, and says which they are", async () => {
    world.sender.otherPending = ['esv-someone-elses-secret'];

    const { outcome } = await runSetup();

    expect(outcome).toBe(false);
    expect(calls.some((c) => c.startsWith('sender:apply'))).toBe(false);
    expect(messages('warn').join('\n')).toContain('esv-someone-elses-secret');
  });

  test('starts the apply and does not wait with --no-wait', async () => {
    const { outcome } = await runSetup({ wait: false });

    expect(outcome).toBe(true);
    expect(calls).toContain('sender:apply:wait=false:timeout=600000');
    expect(calls).not.toContain('sender:test');
    expect(messages('info').join('\n')).toContain('being applied');
  });

  test('passes the timeout in milliseconds', async () => {
    await runSetup({ timeout: 90 });

    expect(calls).toContain('sender:apply:wait=true:timeout=90000');
  });

  test('reports an apply that failed', async () => {
    world.applyResult = false;

    const { outcome } = await runSetup();

    expect(outcome).toBe(false);
    expect(messages('error').join('\n')).toContain('were not applied');
    expect(calls).not.toContain('sender:test');
  });

  test('tests the proxy until it answers: a new proxy takes a while to load', async () => {
    world.testResults = [
      {
        ok: false,
        status: 'not-found',
        httpStatus: 404,
        message: 'not loaded yet',
      },
      {
        ok: false,
        status: 'not-found',
        httpStatus: 404,
        message: 'not loaded yet',
      },
    ];

    const { outcome, clock } = await runSetup();

    expect(outcome).toBe(true);
    expect(calls.filter((c) => c === 'sender:test')).toHaveLength(5);
    expect(clock.slept).toEqual([10000, 10000, 3000, 3000]);
  });

  test('one answer is not enough: it must answer three tests in a row, and a failure starts the count again', async () => {
    world.testResults = [
      okResult,
      {
        ok: false,
        status: 'not-found',
        httpStatus: 404,
        message: 'not loaded yet',
      },
      okResult,
      okResult,
    ];

    const { outcome, clock } = await runSetup();

    expect(outcome).toBe(true);
    expect(calls.filter((c) => c === 'sender:test')).toHaveLength(5);
    expect(clock.slept).toEqual([3000, 10000, 3000, 3000]);
  });

  test('says so when it answered but not three tests in a row before the timeout', async () => {
    world.testResults = [okResult, okResult];
    const clock = fakeClock();

    const result = await waitUntilRemoteProxyAnswers('zion', 5, clock.deps);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('not 3 tests in a row');
    expect(calls.filter((c) => c === 'sender:test')).toHaveLength(2);
  });

  test('setup reports a proxy that did not keep answering as not set up yet', async () => {
    world.testResults = [okResult, okResult];

    const { outcome } = await runSetup({ timeout: 5 });

    expect(outcome).toBe(false);
    expect(messages('error').join('\n')).toContain(
      'frodo idm remote-proxy test -i zion'
    );
  });

  test('gives up when it still does not answer at the timeout, and says how to check it later', async () => {
    world.testResults = Array.from({ length: 100 }, () => ({
      ok: false,
      status: 'not-found',
      httpStatus: 404,
      message: 'not loaded yet',
    }));

    const { outcome, clock } = await runSetup({ timeout: 35 });

    expect(outcome).toBe(false);
    expect(clock.slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(35000);
    expect(messages('error').join('\n')).toContain(
      'frodo idm remote-proxy test -i zion'
    );
  });
});

describe('teardown', () => {
  async function setupThenForget() {
    await runSetup();
    calls.length = 0;
    printed.length = 0;
    guardCalls.length = 0;
  }
  const TEARDOWN = { proxyId: 'zion', target: RECEIVER, yes: true };
  const runTeardown = async (options = {}) => {
    const clock = fakeClock();
    const outcome = await teardownRemoteProxy(
      { ...TEARDOWN, ...options },
      clock.deps
    );
    return { outcome, clock };
  };

  test('cuts the access first: the mapping, then the client, and only then the proxy, the ESV variable and the ESV secret', async () => {
    await setupThenForget();

    const { outcome } = await runTeardown();

    expect(outcome).toBe(true);
    expect(calls).toEqual([
      'receiver:login',
      'receiver:deleteMapping:frodo-remote-proxy-matrix',
      'receiver:deleteClient:frodo-remote-proxy-matrix',
      'sender:deleteProxy:zion',
      `sender:deleteVariable:${HOST_VARIABLE_ID}`,
      `sender:deleteSecret:${SECRET_ID}`,
    ]);
    expect(
      world.sender.proxies.size +
        world.sender.secrets.size +
        world.sender.variables.size
    ).toBe(0);
    expect(world.receiver.clients.size + world.receiver.mappings.size).toBe(0);
  });

  test('lists what it deletes and asks, naming both tenants', async () => {
    await setupThenForget();

    await runTeardown({ yes: false });

    const ask = guardCalls.find((c) => c.fn === 'confirmBulkDelete');
    expect(ask.what).toContain('the remote proxy "zion"');
    expect(ask.what).toContain(RECEIVER);
    const plan = messages('data').join('\n');
    expect(plan).toContain('remote proxy "zion" | delete');
    expect(plan).toContain(
      'OAuth2 client "frodo-remote-proxy-matrix" | delete'
    );
  });

  test('a dry run deletes nothing', async () => {
    await setupThenForget();

    const { outcome } = await runTeardown({ dryRun: true, yes: false });

    expect(outcome).toBe(true);
    expect(calls.filter((c) => c.includes('delete'))).toEqual([]);
    expect(world.sender.proxies.has('zion')).toBe(true);
  });

  test('a no to the question deletes nothing', async () => {
    await setupThenForget();
    world.guard.bulk = false;

    const { outcome } = await runTeardown({ yes: false });

    expect(outcome).toBe(false);
    expect(calls.filter((c) => c.includes('delete'))).toEqual([]);
  });

  test('leaves the receiving tenant alone with --keep-client, without even logging in to it', async () => {
    await setupThenForget();

    const { outcome } = await runTeardown({
      keepClient: true,
      target: undefined,
    });

    expect(outcome).toBe(true);
    expect(calls).not.toContain('receiver:login');
    expect(world.receiver.clients.size).toBe(1);
    expect(world.receiver.mappings.size).toBe(1);
    expect(messages('warn').join('\n')).toContain('kept: --keep-client');
  });

  test('finds the receiving tenant from the host name the ESV variable holds', async () => {
    await setupThenForget();
    savedProfileByHostName = (hostName) =>
      hostName === 'openam-zion.id.forgerock.io'
        ? { host: RECEIVER }
        : undefined;

    const { outcome } = await runTeardown({ target: undefined });

    expect(outcome).toBe(true);
    expect(world.receiver.clients.size).toBe(0);
  });

  test('asks for --target or --keep-client when the receiving tenant cannot be found, and deletes nothing', async () => {
    await setupThenForget();

    const { outcome } = await runTeardown({ target: undefined });

    expect(outcome).toBe(false);
    expect(messages('error').join('\n')).toContain('--keep-client');
    expect(calls.filter((c) => c.includes('delete'))).toEqual([]);
  });

  test('keeps the client, and its mapping, while another remote proxy uses it', async () => {
    await setupThenForget();
    world.sender.proxies.set('other', {
      _id: 'external.idm/other',
      clientId: 'frodo-remote-proxy-matrix',
    });

    const { outcome } = await runTeardown();

    expect(outcome).toBe(true);
    expect(world.receiver.clients.size).toBe(1);
    expect(world.receiver.mappings.size).toBe(1);
    expect(messages('warn').join('\n')).toContain('also used by other');
    expect(world.sender.proxies.has('zion')).toBe(false);
  });

  test('retries a delete that IDM refuses while the proxy still seems to use the variable', async () => {
    await setupThenForget();
    world.sender.deleteRefusals.variable = 2;

    const { outcome, clock } = await runTeardown();

    expect(outcome).toBe(true);
    expect(clock.slept).toEqual([15000, 15000]);
    expect(calls).toContain(`sender:deleteVariable:${HOST_VARIABLE_ID}`);
    expect(calls).toContain('receiver:deleteClient:frodo-remote-proxy-matrix');
  });

  test('gives up retrying at the timeout: the access is already cut, and running it again can finish', async () => {
    await setupThenForget();
    world.sender.deleteRefusals.variable = 1000;

    const { outcome } = await runTeardown({ timeout: 40 });

    expect(outcome).toBe(false);
    expect(messages('error').join('\n')).toContain(
      'existing config placeholder'
    );
    expect(calls).toContain('receiver:deleteClient:frodo-remote-proxy-matrix');
    expect(world.receiver.clients.size + world.receiver.mappings.size).toBe(0);
    expect(world.sender.variables.has(HOST_VARIABLE_ID)).toBe(true);

    // the refusal ends after a while: the second run finishes the job
    world.sender.deleteRefusals.variable = 0;
    calls.length = 0;
    const second = await runTeardown({ target: undefined });
    expect(second.outcome).toBe(true);
    expect(world.sender.variables.size + world.sender.secrets.size).toBe(0);
  });

  test.each([
    [
      'only the combined message',
      () =>
        Object.assign(new Error('Error deleting variable x'), {
          getCombinedMessage: () =>
            'Error deleting variable x\nMessage: Cannot delete a variable that has an existing config placeholder',
        }),
    ],
    [
      'only the HTTP message',
      () =>
        Object.assign(new Error('Error deleting variable x'), {
          httpMessage:
            'Cannot delete a variable that has an existing config placeholder',
        }),
    ],
    [
      'only the message',
      () =>
        new Error(
          'Cannot delete a variable that has an existing config placeholder'
        ),
    ],
  ])(
    'recognises the refusal when %s carries the reason',
    async (_name, makeError) => {
      await setupThenForget();
      world.sender.deleteRefusals.variable = 1;
      world.sender.refusalError = makeError;

      const { outcome, clock } = await runTeardown();

      expect(outcome).toBe(true);
      expect(clock.slept).toEqual([15000]);
    }
  );

  test('does not retry an error that is not about the placeholder', async () => {
    await setupThenForget();
    world.sender.deleteFailure = Object.assign(new Error('Forbidden'), {
      httpStatus: 403,
    });

    const { outcome, clock } = await runTeardown();

    expect(outcome).toBe(false);
    expect(clock.slept).toEqual([]);
    expect(messages('error').join('\n')).toContain('Forbidden');
  });

  test('says so, and succeeds, when there is nothing to remove', async () => {
    const { outcome } = await runTeardown();

    expect(outcome).toBe(true);
    expect(messages('info').join('\n')).toContain('Nothing to remove');
    expect(calls).toEqual([]);
  });

  test('removes the leftovers of a proxy that is gone, and keeps the client it cannot know', async () => {
    await setupThenForget();
    world.sender.proxies.clear();

    const { outcome } = await runTeardown({ target: undefined });

    expect(outcome).toBe(true);
    expect(calls).toEqual([
      `sender:deleteVariable:${HOST_VARIABLE_ID}`,
      `sender:deleteSecret:${SECRET_ID}`,
    ]);
    expect(messages('info').join('\n')).not.toContain('Deleted OAuth2 client');
    expect(world.receiver.clients.size).toBe(1);
  });

  test('refuses a name the library refuses, before it reads anything', async () => {
    const { outcome } = await runTeardown({ proxyId: 'a/b' });

    expect(outcome).toBe(false);
    expect(messages('error').join('\n')).toContain('"a/b" is not allowed');
    expect(calls).toEqual([]);
  });
});
