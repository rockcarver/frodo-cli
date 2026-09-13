/**
 * Unit tests for JourneyDebugAggregator.ts, the session-aggregating engine
 * behind `frodo debug --topic journey`'s interactive list.
 *
 * Mocking mirrors mcp-server-ops.test.js: a minimal `@rockcarver/frodo-lib`
 * surface is mocked before the dynamic import of the module under test,
 * with overridable `mock*` closures reassigned per test.
 *
 * `createLogTailStream` (not `tail` directly) is what the aggregator now
 * calls -- cookie-tracking and redelivery-dedup both moved into frodo-lib's
 * real implementation (see LogOps.unit.test.ts there for that coverage),
 * so this file's mock is deliberately a thin, non-deduping pass-through:
 * whatever `mockTailResult.result` holds is exactly what `poll()` returns,
 * letting every test below keep asserting on the aggregator's own
 * ingestion/grouping logic in isolation from that.
 */
import { jest } from '@jest/globals';

let mockTailResult = { result: [], pagedResultsCookie: undefined };
let mockTail = async () => mockTailResult;
let mockExportJourney = async (treeName) => ({ trees: { [treeName]: {} } });
let mockReadAuthenticationSettings = async () => ({});
let mockGetServiceAccount = async () => {
  throw Object.assign(new Error('not found'), { httpStatus: 404 });
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    cloud: {
      log: {
        createLogTailStream: () => ({
          poll: async () => (await mockTail()).result ?? [],
        }),
      },
      serviceAccount: {
        getServiceAccount: (...args) => mockGetServiceAccount(...args),
      },
    },
    authn: {
      journey: {
        exportJourney: (...args) => mockExportJourney(...args),
      },
      settings: {
        readAuthenticationSettings: (...args) =>
          mockReadAuthenticationSettings(...args),
      },
    },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: () => {},
  printError: () => {},
  verboseMessage: () => {},
}));

const { JourneyDebugAggregator } = await import(
  '../../src/ops/JourneyDebugAggregator.ts'
);

function nodeEvent({
  transactionId,
  treeName = 'Login',
  displayName = 'Username Collector',
  nodeType = 'UsernameCollectorNode',
  nodeOutcome = 'true',
  principal,
  trackingIds,
}) {
  return {
    payload: JSON.stringify({
      component: 'Authentication',
      eventName: 'AM-NODE-LOGIN-COMPLETED',
      transactionId,
      principal: principal ? [principal] : undefined,
      trackingIds,
      entries: [
        { info: { treeName, displayName, nodeType, nodeOutcome } },
      ],
    }),
  };
}

function treeCompletedEvent({
  transactionId,
  treeName = 'Login',
  result = 'SUCCESSFUL',
  failureReason,
  principal,
  trackingIds,
}) {
  return {
    payload: JSON.stringify({
      component: 'Authentication',
      eventName: 'AM-TREE-LOGIN-COMPLETED',
      transactionId,
      result,
      principal: principal ? [principal] : undefined,
      trackingIds,
      entries: [
        {
          info: {
            treeName,
            ...(failureReason
              ? { nodeExtraLogging: { failureReason } }
              : {}),
          },
        },
      ],
    }),
  };
}

function loginCompletedEvent({ transactionId, principal, result = 'SUCCESSFUL' }) {
  return {
    payload: JSON.stringify({
      component: 'Authentication',
      eventName: 'AM-LOGIN-COMPLETED',
      transactionId,
      result,
      principal: principal ? [principal] : undefined,
    }),
  };
}

beforeEach(() => {
  mockTailResult = { result: [], pagedResultsCookie: undefined };
  mockTail = async () => mockTailResult;
  mockExportJourney = async (treeName) => ({ trees: { [treeName]: {} } });
  mockReadAuthenticationSettings = async () => ({
    authenticationSessionsMaxDuration: 5,
    suspendedAuthenticationTimeout: 5,
  });
  mockGetServiceAccount = async () => {
    throw Object.assign(new Error('not found'), { httpStatus: 404 });
  };
});

afterEach(() => {
  jest.useRealTimers();
});

describe('JourneyDebugAggregator - empty/no-activity state', () => {
  test('poll() with zero events never throws and leaves an empty session list', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = { result: [], pagedResultsCookie: 'cookie-1' };
    await expect(aggregator.poll()).resolves.toBeUndefined();
    expect(aggregator.getSessions()).toEqual([]);
  });

  test('a tail() failure is swallowed, reported via onWarning, and never thrown', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTail = async () => {
      throw new Error('simulated network failure');
    };
    const warnings = [];
    await expect(
      aggregator.poll((message) => warnings.push(message))
    ).resolves.toBeUndefined();
    expect(aggregator.getSessions()).toEqual([]);
    expect(warnings.some((w) => w.includes('simulated network failure'))).toBe(
      true
    );
  });

  test('multiple consecutive empty polls stay error-free and empty (journey may not start for minutes)', async () => {
    const aggregator = new JourneyDebugAggregator();
    for (let i = 0; i < 5; i++) {
      await expect(aggregator.poll()).resolves.toBeUndefined();
    }
    expect(aggregator.getSessions()).toEqual([]);
  });
});

describe('JourneyDebugAggregator - classification', () => {
  test('a login-completed event with no accompanying node/tree event never creates a tracked session', async () => {
    // Regression test: OAuth2 client authentication (e.g. a service client
    // like an internal filter/resource-server client using
    // client_credentials) completes via AM-LOGIN-COMPLETED with a real
    // transactionId and principal but never runs through a tree -- this
    // showed up live as a flood of "(unknown tree) as <service-client>"
    // rows that were pure noise for journey debugging.
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        loginCompletedEvent({
          transactionId: 'tx-client-auth',
          principal: 'org-filter-client',
        }),
      ],
    };
    await aggregator.poll();
    expect(aggregator.getSessions()).toEqual([]);
  });

  test('a login-completed event still enriches an already-tracked session (e.g. resolves its user)', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({ transactionId: 'tx-real-login' }),
        loginCompletedEvent({
          transactionId: 'tx-real-login',
          principal: 'demo-user',
        }),
      ],
    };
    await aggregator.poll();
    const sessions = aggregator.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].user).toBe('demo-user');
  });

  test('a node event creates a running session', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [nodeEvent({ transactionId: 'tx-1' })],
    };
    await aggregator.poll();
    const sessions = aggregator.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      transactionId: 'tx-1',
      treeName: 'Login',
      status: 'running',
      nodeCount: 1,
      lastNode: 'Username Collector',
    });
  });

  test('a successful tree-completed event marks the session finished', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({ transactionId: 'tx-2' }),
        treeCompletedEvent({
          transactionId: 'tx-2',
          result: 'SUCCESSFUL',
          principal: 'demo-user',
        }),
      ],
    };
    await aggregator.poll();
    const [session] = aggregator.getSessions();
    expect(session.status).toBe('finished');
    expect(session.user).toBe('demo-user');
  });

  test('a failed tree-completed event marks the session failed with a compacted failure reason', async () => {
    const aggregator = new JourneyDebugAggregator();
    const rawFailure =
      'javax.script.ScriptException: java.util.concurrent.ExecutionException: javax.script.ScriptException: ReferenceError: "thisVariableDoesNotExist" is not defined. (frodo-debug-test-broken-script#2) in frodo-debug-test-broken-script at line number 2 at column number 0';
    mockTailResult = {
      result: [
        treeCompletedEvent({
          transactionId: 'tx-3',
          result: 'FAILED',
          failureReason: rawFailure,
        }),
      ],
    };
    await aggregator.poll();
    const [session] = aggregator.getSessions();
    expect(session.status).toBe('failed');
    expect(session.failureReason).toBe(
      'ReferenceError: "thisVariableDoesNotExist" is not defined (frodo-debug-test-broken-script:2)'
    );
  });

  test('a generic tree-level failure with no node identity is enriched with the last completed node and its outcome', async () => {
    // Regression test: confirmed live against a failed `P1P-Login`
    // social-authentication attempt, where AM's only failure detail was
    // the bare string "Node processing failed" -- no node id, no node
    // name, nothing pointing at where in the tree it happened.
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({
          transactionId: 'tx-social-fail',
          treeName: 'P1P-Login',
          displayName: 'Login Page',
          nodeOutcome: 'socialAuthentication',
        }),
        treeCompletedEvent({
          transactionId: 'tx-social-fail',
          treeName: 'P1P-Login',
          result: 'FAILED',
          failureReason: 'Node processing failed',
        }),
      ],
    };
    await aggregator.poll();
    const [session] = aggregator.getSessions();
    expect(session.failureReason).toBe(
      'Node processing failed (last completed step: Login Page → socialAuthentication)'
    );
  });

  test('events are grouped by transactionId, not by tree name', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({ transactionId: 'tx-a', treeName: 'Login' }),
        nodeEvent({ transactionId: 'tx-b', treeName: 'Login' }),
      ],
    };
    await aggregator.poll();
    expect(aggregator.getSessions()).toHaveLength(2);
  });

  test('an event with no transactionId is skipped rather than crashing', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        {
          payload: JSON.stringify({
            component: 'Authentication',
            eventName: 'AM-NODE-LOGIN-COMPLETED',
            entries: [{ info: { treeName: 'Login' } }],
          }),
        },
      ],
    };
    await expect(aggregator.poll()).resolves.toBeUndefined();
    expect(aggregator.getSessions()).toEqual([]);
  });
});

describe('JourneyDebugAggregator - abandoned detection', () => {
  test('a running session past the realm authentication-session lifetime is marked abandoned', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    mockReadAuthenticationSettings = async () => ({
      authenticationSessionsMaxDuration: 5,
      suspendedAuthenticationTimeout: 5,
    });
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = { result: [nodeEvent({ transactionId: 'tx-old' })] };
    await aggregator.poll();
    expect(aggregator.getSessions()[0].status).toBe('running');

    jest.setSystemTime(new Date('2026-01-01T00:06:00Z')); // 6 min later
    mockTailResult = { result: [] };
    await aggregator.poll();
    expect(aggregator.getSessions()[0].status).toBe('abandoned');
  });

  test('a running session exposes its effective abandoned-after duration for the UI to cite', async () => {
    mockReadAuthenticationSettings = async () => ({
      authenticationSessionsMaxDuration: 5,
      suspendedAuthenticationTimeout: 5,
    });
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = { result: [nodeEvent({ transactionId: 'tx-quiet' })] };
    await aggregator.poll();
    expect(aggregator.getSessions()[0].abandonedAfterMinutes).toBe(5);
  });

  test('a fresh node event revives a previously-abandoned session back to running', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = { result: [nodeEvent({ transactionId: 'tx-revive' })] };
    await aggregator.poll();

    jest.setSystemTime(new Date('2026-01-01T00:06:00Z'));
    mockTailResult = { result: [] };
    await aggregator.poll();
    expect(aggregator.getSessions()[0].status).toBe('abandoned');

    mockTailResult = { result: [nodeEvent({ transactionId: 'tx-revive' })] };
    await aggregator.poll();
    expect(aggregator.getSessions()[0].status).toBe('running');
  });

  test("an UpdateJourneyTimeoutNode SET override extends the abandoned threshold for that tree", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    mockReadAuthenticationSettings = async () => ({
      authenticationSessionsMaxDuration: 5,
      suspendedAuthenticationTimeout: 5,
    });
    mockExportJourney = async (treeName) => ({
      trees: {
        [treeName]: {
          innerNodes: {
            n1: {
              _type: { _id: 'UpdateJourneyTimeoutNode' },
              operation: 'SET',
              value: 30,
            },
          },
        },
      },
    });
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [nodeEvent({ transactionId: 'tx-idv', treeName: 'IDV' })],
    };
    await aggregator.poll();

    // Past the realm's plain 5-minute default, but well within the
    // journey's own 30-minute override -- must still read as running.
    jest.setSystemTime(new Date('2026-01-01T00:10:00Z'));
    mockTailResult = { result: [] };
    await aggregator.poll(); // lets the lazily-fetched tree definition resolve
    await aggregator.poll();
    expect(aggregator.getSessions()[0].status).toBe('running');

    // Past the 30-minute override too -- now genuinely abandoned.
    jest.setSystemTime(new Date('2026-01-01T00:35:00Z'));
    mockTailResult = { result: [] };
    await aggregator.poll();
    expect(aggregator.getSessions()[0].status).toBe('abandoned');
  });

  test('a failed export lookup degrades gracefully to the realm default instead of throwing', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    mockExportJourney = async () => {
      throw new Error('403 insufficient privilege');
    };
    const aggregator = new JourneyDebugAggregator();
    const warnings = [];
    mockTailResult = { result: [nodeEvent({ transactionId: 'tx-noperm' })] };
    await aggregator.poll((m) => warnings.push(m));

    jest.setSystemTime(new Date('2026-01-01T00:06:00Z'));
    mockTailResult = { result: [] };
    await aggregator.poll((m) => warnings.push(m));
    expect(aggregator.getSessions()[0].status).toBe('abandoned');
    expect(
      warnings.some((w) => w.includes('403 insufficient privilege'))
    ).toBe(true);
  });
});

describe('JourneyDebugAggregator - pinning and eviction', () => {
  test('togglePin flips a session pinned flag', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = { result: [nodeEvent({ transactionId: 'tx-pin' })] };
    await aggregator.poll();
    expect(aggregator.getSessions()[0].pinned).toBe(false);
    aggregator.togglePin('tx-pin');
    expect(aggregator.getSessions()[0].pinned).toBe(true);
    aggregator.togglePin('tx-pin');
    expect(aggregator.getSessions()[0].pinned).toBe(false);
  });

  test('a finished, unpinned session is evicted after its completion grace window', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [treeCompletedEvent({ transactionId: 'tx-done' })],
    };
    await aggregator.poll();
    expect(aggregator.getSessions()).toHaveLength(1);

    jest.setSystemTime(new Date('2026-01-01T00:15:00Z')); // well past grace window
    mockTailResult = { result: [] };
    await aggregator.poll();
    expect(aggregator.getSessions()).toHaveLength(0);
  });

  test('a pinned, finished session survives past the completion grace window', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [treeCompletedEvent({ transactionId: 'tx-pinned-done' })],
    };
    await aggregator.poll();
    aggregator.togglePin('tx-pinned-done');

    jest.setSystemTime(new Date('2026-01-01T00:15:00Z'));
    mockTailResult = { result: [] };
    await aggregator.poll();
    expect(aggregator.getSessions()).toHaveLength(1);
    expect(aggregator.getSessions()[0].pinned).toBe(true);
  });
});

describe('JourneyDebugAggregator - user identity precedence', () => {
  // Regression test: confirmed live against `volker-dev` that a scripted
  // "Enrich Session"-style node's own internal IDM call logs in as a
  // service identity (e.g. `idm-provisioning`) under the *same*
  // transactionId as the real user's journey -- a bare AM-LOGIN-COMPLETED
  // for that nested call must never clobber a user already established
  // from this tree's own node/tree events.
  test('a nested internal login-completed event enriches events but never overrides an already-established user', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({
          transactionId: 'tx-nested',
          principal: 'real.user@example.com',
        }),
        loginCompletedEvent({
          transactionId: 'tx-nested',
          principal: 'idm-provisioning',
        }),
      ],
    };
    await aggregator.poll();
    const [session] = aggregator.getSessions();
    expect(session.user).toBe('real.user@example.com');
    expect(session.events).toHaveLength(2);
    expect(session.events[1].step).toBe('Login');
    expect(session.events[1].outcome).toContain('idm-provisioning');
  });

  test('a bare login-completed event still fills in the user as a fallback when nothing else is known yet', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({ transactionId: 'tx-fallback' }),
        loginCompletedEvent({
          transactionId: 'tx-fallback',
          principal: 'fallback-user',
        }),
      ],
    };
    await aggregator.poll();
    expect(aggregator.getSessions()[0].user).toBe('fallback-user');
  });
});

describe('JourneyDebugAggregator - realm settings unavailable', () => {
  // Regression test: `readAuthenticationSettings()` resolves to `null`
  // (rather than throwing) when AM reports "This operation is not
  // available in PingOne Advanced Identity Cloud" -- confirmed live
  // against `volker-dev`'s realm-level settings. Consuming it without a
  // null check crashed with "Cannot read properties of null".
  test('a null result falls back to the default without throwing, and is never retried', async () => {
    mockReadAuthenticationSettings = async () => null;
    const aggregator = new JourneyDebugAggregator();
    const warnings = [];
    mockTailResult = {
      result: [nodeEvent({ transactionId: 'tx-nullsettings' })],
    };
    await expect(
      aggregator.poll((m) => warnings.push(m))
    ).resolves.toBeUndefined();
    expect(aggregator.getSessions()[0].status).toBe('running');
    expect(warnings).toEqual([]);

    mockReadAuthenticationSettings = async () => {
      throw new Error('should not be called again once permanently resolved');
    };
    await expect(
      aggregator.poll((m) => warnings.push(m))
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([]);
  });
});

describe('JourneyDebugAggregator - service account name resolution', () => {
  // Regression test: `FRServiceAccountInternal` (AM's own internal
  // service-account JWT-bearer auth tree) logs a raw service-account UUID
  // as its principal -- confirmed live against `volker-dev` -- so the list
  // showed an opaque UUID instead of the account's actual name.
  test("FRServiceAccountInternal's raw principal UUID resolves to the account's name", async () => {
    mockGetServiceAccount = async (id) => ({
      _id: id,
      name: 'CI Pipeline',
      description: 'used by the nightly job',
    });
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({
          transactionId: 'tx-svcacct',
          treeName: 'FRServiceAccountInternal',
          principal: 'a2245410-33a6-4442-9f3b-453c9aaf158a',
        }),
      ],
    };
    await aggregator.poll(); // kicks off resolution (fire-and-forget)
    await aggregator.poll(); // picks up the now-resolved cache entry
    const [session] = aggregator.getSessions();
    expect(session.user).toBe('a2245410-33a6-4442-9f3b-453c9aaf158a');
    expect(session.userDisplayName).toBe('CI Pipeline');
  });

  test('an id that does not resolve to a real service account (404) is left unresolved permanently, without warning', async () => {
    const aggregator = new JourneyDebugAggregator();
    const warnings = [];
    mockTailResult = {
      result: [
        nodeEvent({
          transactionId: 'tx-svcacct-404',
          treeName: 'FRServiceAccountInternal',
          principal: 'not-a-real-service-account',
        }),
      ],
    };
    await aggregator.poll((m) => warnings.push(m));
    await aggregator.poll((m) => warnings.push(m));
    expect(aggregator.getSessions()[0].userDisplayName).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  test('a non-FRServiceAccountInternal tree never attempts service-account resolution', async () => {
    mockGetServiceAccount = async () => {
      throw new Error('should not be called for a regular journey');
    };
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({
          transactionId: 'tx-plain',
          treeName: 'Login',
          principal: 'vscheuber@gmail.com',
        }),
      ],
    };
    await expect(aggregator.poll()).resolves.toBeUndefined();
    expect(aggregator.getSessions()[0].userDisplayName).toBeUndefined();
  });
});

describe('JourneyDebugAggregator - cross-transaction correlation (polling nodes)', () => {
  // Regression test: confirmed live against a real `MultiplePushDevicesExample`
  // login that AM assigns a *different* transactionId to each polling leg
  // of a wait-node-based flow, but every leg's events carry the flow's very
  // first event id in `trackingIds` -- without correlating on that, one real
  // login showed up as several separate, seemingly-unrelated sessions.
  const SHARED_TRACKING_ID = 'f90b30c3-f6bc-44a6-aea7-d154585b025a-1633266';

  test('later polling legs under a different transactionId merge into the original session, not a new one', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({
          transactionId: 'leg-3',
          treeName: 'MultiplePushDevicesExample',
          displayName: 'Resolve User',
          principal: 'demo-user',
          trackingIds: [SHARED_TRACKING_ID],
        }),
      ],
    };
    await aggregator.poll();
    expect(aggregator.getSessions()).toHaveLength(1);

    mockTailResult = {
      result: [
        nodeEvent({
          transactionId: 'leg-4',
          treeName: 'MultiplePushDevicesExample',
          displayName: 'Send Push',
          principal: 'demo-user',
          trackingIds: [SHARED_TRACKING_ID],
        }),
      ],
    };
    await aggregator.poll();
    expect(aggregator.getSessions()).toHaveLength(1);
    expect(aggregator.getSessions()[0].nodeCount).toBe(2);
    expect(aggregator.getSessions()[0].lastNode).toBe('Send Push');

    mockTailResult = {
      result: [
        treeCompletedEvent({
          transactionId: 'leg-6',
          treeName: 'MultiplePushDevicesExample',
          result: 'SUCCESSFUL',
          principal: 'demo-user',
          trackingIds: [SHARED_TRACKING_ID],
        }),
      ],
    };
    await aggregator.poll();
    const sessions = aggregator.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('finished');
    expect(sessions[0].nodeCount).toBe(2);
  });

  test('two genuinely unrelated flows with no shared trackingIds stay separate sessions', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({
          transactionId: 'tx-unrelated-a',
          trackingIds: ['tracking-a'],
        }),
        nodeEvent({
          transactionId: 'tx-unrelated-b',
          trackingIds: ['tracking-b'],
        }),
      ],
    };
    await aggregator.poll();
    expect(aggregator.getSessions()).toHaveLength(2);
  });

  test('a plain, non-polling tree with no trackingIds at all is unaffected', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({ transactionId: 'tx-plain-flow' }),
        treeCompletedEvent({
          transactionId: 'tx-plain-flow',
          result: 'SUCCESSFUL',
        }),
      ],
    };
    await aggregator.poll();
    const sessions = aggregator.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('finished');
  });
});

describe('JourneyDebugAggregator - event entry structure', () => {
  // Event entries are kept structured (step/type/outcome), not a
  // pre-formatted string, so the UI can render them as real table columns.
  test('a node event produces a structured entry with its display name, type, and outcome', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({
          transactionId: 'tx-struct-node',
          displayName: 'Platform Username',
          nodeType: 'ValidatedUsernameNode',
          nodeOutcome: 'outcome',
        }),
      ],
    };
    await aggregator.poll();
    const [entry] = aggregator.getSessions()[0].events;
    expect(entry).toMatchObject({
      step: 'Platform Username',
      type: 'ValidatedUsernameNode',
      outcome: 'outcome',
    });
  });

  test('a successful tree-completed event produces a "Tree completed" entry with no outcome text', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({ transactionId: 'tx-struct-tree' }),
        treeCompletedEvent({
          transactionId: 'tx-struct-tree',
          result: 'SUCCESSFUL',
        }),
      ],
    };
    await aggregator.poll();
    const events = aggregator.getSessions()[0].events;
    expect(events[1]).toMatchObject({ step: 'Tree completed', type: 'SUCCESSFUL' });
    expect(events[1].outcome).toBeUndefined();
  });

  test('a failed tree-completed event carries the same enriched failure text as session.failureReason', async () => {
    const aggregator = new JourneyDebugAggregator();
    mockTailResult = {
      result: [
        nodeEvent({
          transactionId: 'tx-struct-fail',
          displayName: 'Login Page',
          nodeOutcome: 'socialAuthentication',
        }),
        treeCompletedEvent({
          transactionId: 'tx-struct-fail',
          result: 'FAILED',
          failureReason: 'Node processing failed',
        }),
      ],
    };
    await aggregator.poll();
    const session = aggregator.getSessions()[0];
    expect(session.events[1].outcome).toBe(session.failureReason);
    expect(session.events[1].outcome).toContain('Login Page → socialAuthentication');
  });
});
