/**
 * Unit tests for JourneyDebugAggregator.ts, the session-aggregating engine
 * behind `frodo debug --topic journey`'s interactive list.
 *
 * Mocking mirrors mcp-server-ops.test.js: a minimal `@rockcarver/frodo-lib`
 * surface is mocked before the dynamic import of the module under test,
 * with overridable `mock*` closures reassigned per test.
 */
import { jest } from '@jest/globals';

let mockTailResult = { result: [], pagedResultsCookie: undefined };
let mockTail = async () => mockTailResult;
let mockExportJourney = async (treeName) => ({ trees: { [treeName]: {} } });
let mockReadAuthenticationSettings = async () => ({});

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    cloud: {
      log: {
        tail: (...args) => mockTail(...args),
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
}) {
  return {
    payload: JSON.stringify({
      component: 'Authentication',
      eventName: 'AM-NODE-LOGIN-COMPLETED',
      transactionId,
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
}) {
  return {
    payload: JSON.stringify({
      component: 'Authentication',
      eventName: 'AM-TREE-LOGIN-COMPLETED',
      transactionId,
      result,
      principal: principal ? [principal] : undefined,
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
