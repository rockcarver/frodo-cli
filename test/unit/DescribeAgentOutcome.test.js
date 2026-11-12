import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * The describe operations of the agent commands (cli#1274): `agent describe`,
 * `agent gateway|java|web describe` and `aiagent describe` (also run as
 * `agent ai describe`). An operation prints what it found and says whether it
 * could, so that the command can end with exit code 1 when the agent does not
 * exist or cannot be read (record 0033: the code sets the exit code and
 * returns). Before, the operations swallowed the error and returned an empty
 * string, which the command printed as an empty line before it ended with 0.
 *
 * The real import graph of the ops modules pulls in all of frodo-lib, whose
 * bundled ESM cannot load under jest's ESM runtime, so the library is a deep
 * stub (a spy for every property read) and the console is a set of spies.
 */

/** A function that is a spy and, for any property read, another such function. */
function deepStub() {
  const children = new Map();
  return new Proxy(jest.fn(), {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (!children.has(prop)) children.set(prop, deepStub());
      return children.get(prop);
    },
  });
}

class FrodoError extends Error {}
const frodo = deepStub();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo,
  state: deepStub(),
  FrodoError,
}));

const printMessage = jest.fn();
const printError = jest.fn();
/** A table that keeps its rows and prints them one per line, cells joined by ` | `. */
const createTable = jest.fn(() => {
  const rows = [];
  return {
    push: (row) => rows.push(row),
    toString: () => rows.map((row) => row.join(' | ')).join('\n'),
  };
});
jest.unstable_mockModule('../../src/utils/Console', () => ({
  createProgressIndicator: jest.fn(),
  createTable,
  debugMessage: jest.fn(),
  printError,
  printMessage,
  stopProgressIndicator: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));

const ops = await import('../../src/ops/AgentOps.ts');

const MISSING_ID = 'Specify the agent to describe with -i, --agent-id.';

/**
 * An agent as the library reads it (only what the description shows). Where the
 * status lives depends on the type of the agent.
 */
const agentOf = (id, status = 'Active', type = 'Agent') => {
  const agent = { _id: id, _type: { _id: type, name: type } };
  switch (type) {
    case 'AIAgent':
      agent.coreOAuth2ClientConfig = { status: { value: status } };
      break;
    case 'J2EEAgent':
      agent.globalJ2EEAgentConfig = { status };
      break;
    case 'WebAgent':
      agent.globalWebAgentConfig = { status };
      break;
    default:
      agent.status = status;
  }
  return agent;
};

/** The error of a read the tenant answers with 404, as the library throws it. */
const notFoundError = () => {
  const error = new FrodoError('Error reading agent');
  error.httpStatus = 404;
  return error;
};

const dataMessages = () =>
  printMessage.mock.calls
    .filter(([, type]) => type === 'data')
    .map(([text]) => text);
const errorMessages = () =>
  printMessage.mock.calls
    .filter(([, type]) => type === 'error')
    .map(([text]) => text);

// One case per describe operation of one agent. `read` is the library read the
// operation makes, `readsList` is true when it reads every agent of the type and
// looks the id up in the list (the library has no read of one agent for these).
const CASES = [
  {
    name: 'describeAIAgent',
    describeOne: (id, json) => ops.describeAIAgent(id, json),
    read: () => frodo.agent.readAIAgent,
    readsList: false,
    type: 'AIAgent',
    failureHeading: (id) => `Error describing AIAgent ${id}`,
  },
  {
    name: 'describeIdentityGatewayAgent',
    describeOne: (id, json) => ops.describeIdentityGatewayAgent(id, json),
    read: () => frodo.agent.readIdentityGatewayAgents,
    readsList: true,
    type: 'IdentityGatewayAgent',
    failureHeading: (id) => `Error describing Identity Gateway Agent ${id}`,
  },
  {
    name: 'describeJavaAgent',
    describeOne: (id, json) => ops.describeJavaAgent(id, json),
    read: () => frodo.agent.readJavaAgents,
    readsList: true,
    type: 'J2EEAgent',
    failureHeading: (id) => `Error describing Java Agent ${id}`,
  },
  {
    name: 'describeWebAgent',
    describeOne: (id, json) => ops.describeWebAgent(id, json),
    read: () => frodo.agent.readWebAgents,
    readsList: true,
    type: 'WebAgent',
    failureHeading: (id) => `Error describing Web Agent ${id}`,
  },
  {
    name: 'describeAgent',
    describeOne: (id, json) => ops.describeAgent(id, true, json),
    read: () => frodo.agent.readAgents,
    readsList: true,
    type: '2.2_Agent',
    failureHeading: (id) => `Error describing agent ${id}`,
  },
];

beforeEach(() => {
  printMessage.mockReset();
  printError.mockReset();
  for (const c of CASES) c.read().mockReset();
  frodo.agent.readAgents.mockReset();
});

describe.each(CASES)('$name', (c) => {
  /** Makes the library answer a read of the agents `ids`. */
  const tenantHolds = (...ids) => {
    const agents = ids.map((id) => agentOf(id, 'Active', c.type));
    if (c.readsList) c.read().mockResolvedValue(agents);
    else
      c.read().mockImplementation(async (id) => {
        if (!ids.includes(id)) throw notFoundError();
        return agents.find((agent) => agent._id === id);
      });
  };

  test('an agent that exists is printed as a table and succeeds', async () => {
    tenantHolds('oracle', 'zion');

    expect(await c.describeOne('zion', false)).toBe(true);

    expect(dataMessages()).toEqual([
      ['Agent Id | zion', 'Status | Active', `Type | ${c.type}`].join('\n'),
    ]);
    expect(errorMessages()).toEqual([]);
    expect(printError).not.toHaveBeenCalled();
  });

  test('an inactive agent is printed with its status', async () => {
    const inactive = { ...agentOf('zion', 'Inactive', c.type) };
    if (c.readsList) c.read().mockResolvedValue([inactive]);
    else c.read().mockResolvedValue(inactive);

    expect(await c.describeOne('zion', false)).toBe(true);

    expect(dataMessages()[0]).toContain('Agent Id | zion');
  });

  test('--json prints the agent as the library read it and succeeds', async () => {
    tenantHolds('oracle', 'zion');

    expect(await c.describeOne('zion', true)).toBe(true);

    expect(dataMessages()).toHaveLength(1);
    expect(JSON.parse(dataMessages()[0])).toEqual(
      agentOf('zion', 'Active', c.type)
    );
    expect(printError).not.toHaveBeenCalled();
  });

  test('an agent that does not exist fails, says so, and prints no description', async () => {
    tenantHolds('oracle');

    expect(await c.describeOne('nobody', false)).toBe(false);

    expect(dataMessages()).toEqual([]);
    if (c.readsList) {
      expect(printError).toHaveBeenCalledTimes(1);
      const [error, heading] = printError.mock.calls[0];
      expect(heading).toBe(c.failureHeading('nobody'));
      expect(error.message).toBe('Agent not found: nobody');
    } else {
      expect(errorMessages()).toEqual(["AI agent 'nobody' not found."]);
      expect(printError).not.toHaveBeenCalled();
    }
  });

  test('--json for an agent that does not exist fails and prints no JSON', async () => {
    tenantHolds('oracle');

    expect(await c.describeOne('nobody', true)).toBe(false);

    expect(dataMessages()).toEqual([]);
  });

  test('an agent that cannot be read fails with the error, not as not found', async () => {
    const failure = new Error('connection reset');
    c.read().mockRejectedValue(failure);

    expect(await c.describeOne('zion', false)).toBe(false);

    expect(dataMessages()).toEqual([]);
    expect(printError).toHaveBeenCalledWith(failure, c.failureHeading('zion'));
    expect(errorMessages()).toEqual([]);
  });

  test.each([[undefined], [''], ['   ']])(
    'no agent id (%j) fails, says what is missing, and asks the tenant for nothing',
    async (id) => {
      tenantHolds('oracle');

      expect(await c.describeOne(id, false)).toBe(false);

      expect(errorMessages()).toEqual([MISSING_ID]);
      expect(dataMessages()).toEqual([]);
      expect(c.read().mock.calls).toEqual([]);
    }
  );
});

describe('describeAgents', () => {
  test('prints a table of every agent and succeeds', async () => {
    frodo.agent.readAgents.mockResolvedValue([
      agentOf('oracle', 'Active', '2.2_Agent'),
      agentOf('zion', 'Inactive', '2.2_Agent'),
    ]);

    expect(await ops.describeAgents(false, false)).toBe(true);

    expect(dataMessages()).toHaveLength(1);
    expect(dataMessages()[0]).toContain('oracle | Active | 2.2_Agent');
    expect(dataMessages()[0]).toContain('zion | Inactive | 2.2_Agent');
    expect(printError).not.toHaveBeenCalled();
  });

  test('--json prints every agent and succeeds', async () => {
    frodo.agent.readAgents.mockResolvedValue([agentOf('oracle')]);

    expect(await ops.describeAgents(false, true)).toBe(true);

    expect(JSON.parse(dataMessages()[0])).toEqual([agentOf('oracle')]);
  });

  test('a realm without agents prints an empty table and succeeds', async () => {
    frodo.agent.readAgents.mockResolvedValue([]);

    expect(await ops.describeAgents(false, false)).toBe(true);

    expect(printError).not.toHaveBeenCalled();
  });

  test('agents that cannot be read fail with the error and print no table', async () => {
    const failure = new Error('connection reset');
    frodo.agent.readAgents.mockRejectedValue(failure);

    expect(await ops.describeAgents(false, false)).toBe(false);

    expect(dataMessages()).toEqual([]);
    expect(printError).toHaveBeenCalledWith(failure, 'Error describing agents');
  });
});
