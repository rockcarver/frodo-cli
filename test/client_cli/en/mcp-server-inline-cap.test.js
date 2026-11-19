/**
 * The inline limit of the MCP transport, on the real path: a real `mcp server start` process (the built
 * CLI, over stdio) answers a real MCP client, with the fake AM (test/utils/FakeAm.mjs) serving AI agents
 * whose description is padded to the size that the test needs.
 *
 * A result whose indented JSON text is larger than 256 KiB is replaced by a note, and the replacement says
 * so in the first fields of the result. The unit tests of `buildSuccessResult` pin what the replacement
 * contains; this test pins that the server hands every result of a dispatch to it, at the exact limit,
 * and that a result below the limit is not touched.
 *
 * The answers are measured, not assumed: the size of an answer is the overhead of the envelope plus the
 * padding, and the overhead is whatever the library puts around the agent, so one calibration run finds
 * the padding that makes the text exactly as large as the limit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { startFakeAm } from '../../utils/StartFakeAm.js';

const cliPath = path.resolve('dist/launch.cjs');
const INLINE_LIMIT_BYTES = 256 * 1024;
// A size close to the limit that has as many digits in the size fields of the metadata as the limit has.
const CALIBRATION_PADDING = 200000;
// Equal lengths: the id is part of the text that is measured.
const CALIBRATION_ID = 'agent-cal';
const FIT_ID = 'agent-fit';
const OVER_ID = 'agent-ovr';
const SMALL_ID = 'agent-sml';

let testDirectory;
let fakeAm;
let client;

const agent = (id, padding) => ({
  _id: id,
  _type: { _id: 'AIAgent', name: 'AI Agent', collection: true },
  description: 'x'.repeat(padding),
});

/**
 * Starts the fake tenant and a real server against it, runs `body` with the connected client and stops both.
 * @param {object[]} aiAgents the AI agents of the fake tenant
 * @param {(connected: Client) => Promise<void>} body what to do with the server
 * @param {string} [policy] the policy of the server (`--policy`)
 */
async function withServer(aiAgents, body, policy = 'read-only') {
  fakeAm = await startFakeAm({
    recordPath: path.join(testDirectory, 'requests.jsonl'),
    journey: 'password',
    aiAgents,
    sessionTtlSeconds: 3600,
  });
  client = new Client(
    { name: 'frodo-cli-test', version: '1.0.0' },
    { supportedProtocolVersions: ['2025-11-25'] }
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      cliPath,
      'mcp',
      'server',
      'start',
      `http://127.0.0.1:${fakeAm.port}/am`,
      'admin',
      'Passw0rd!',
      '--type',
      'classic',
      '--policy',
      policy,
      '--profile',
      'all',
    ],
    env: {
      ...process.env,
      HOME: testDirectory,
      FRODO_TEST: '0',
      NO_COLOR: '1',
      FRODO_NO_UPDATE_CHECK: '1',
      FRODO_NO_CACHE: '1',
      FRODO_TOKEN_CACHE_PATH: path.join(testDirectory, 'TokenCache.json'),
      FRODO_MASTER_KEY_PATH: path.join(testDirectory, 'masterkey.key'),
      FRODO_CONNECTION_PROFILES_PATH: path.join(
        testDirectory,
        'Connections.json'
      ),
    },
    cwd: testDirectory,
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    await body(client);
  } finally {
    await client.close().catch(() => undefined);
    fakeAm.stop();
    client = undefined;
    fakeAm = undefined;
  }
}

/** The text of the answer of a read-only dispatch. */
async function dispatch(connected, skillId, namedArgs) {
  const answer = await connected.callTool({
    name: 'frodo_dispatch_read_only',
    arguments: { skillId, ...(namedArgs && { namedArgs }) },
  });
  expect(answer.isError).not.toBe(true);
  expect(answer.content).toHaveLength(1);
  return answer.content[0].text;
}

const readAgent = (connected, agentId) =>
  dispatch(connected, 'agent.readAIAgent', { agentId });

beforeEach(() => {
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-mcp-cap-'));
});

afterEach(() => {
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('the inline limit is exact on the real path: a result of 262144 bytes passes untouched, one byte more is replaced and says so, a small one is not touched', async () => {
  let calibrated;
  await withServer([agent(CALIBRATION_ID, CALIBRATION_PADDING)], async (c) => {
    calibrated = Buffer.byteLength(await readAgent(c, CALIBRATION_ID));
  });
  const fitPadding = CALIBRATION_PADDING + (INLINE_LIMIT_BYTES - calibrated);

  await withServer(
    [
      agent(SMALL_ID, 10),
      agent(FIT_ID, fitPadding),
      agent(OVER_ID, fitPadding + 1),
    ],
    async (c) => {
      // below the limit: the text is the indented JSON of the result, and nothing was added to it
      const small = await readAgent(c, SMALL_ID);
      const smallResult = JSON.parse(small);
      expect(small).toBe(JSON.stringify(smallResult, null, 2));
      expect(smallResult.data).toEqual(agent(SMALL_ID, 10));
      expect(smallResult).not.toHaveProperty('truncated');
      expect(small).not.toContain('_truncated');

      // exactly at the limit: passes untouched, with all of its data
      const fit = await readAgent(c, FIT_ID);
      expect(Buffer.byteLength(fit)).toBe(INLINE_LIMIT_BYTES);
      const fitResult = JSON.parse(fit);
      expect(fit).toBe(JSON.stringify(fitResult, null, 2));
      expect(fitResult.data.description).toHaveLength(fitPadding);
      expect(fitResult).not.toHaveProperty('truncated');
      expect(fit).not.toContain('_truncated');

      // one byte more: replaced, and the first fields of the result say so
      const over = await readAgent(c, OVER_ID);
      expect(Buffer.byteLength(over)).toBeLessThan(4096);
      const overResult = JSON.parse(over);
      const keys = Object.keys(overResult);
      expect(overResult).toMatchObject({
        toolName: 'frodo_dispatch_read_only',
        descriptorId: 'agent.readAIAgent',
        truncated: true,
        returned: 0,
        data: { _truncated: true },
        metadata: {
          result: {
            payloadSizeBytes: INLINE_LIMIT_BYTES + 1,
            isTruncated: true,
          },
        },
      });
      expect(overResult.warning).toContain(
        'larger than the inline response limit of 262144 bytes (this one is 262145 bytes)'
      );
      // a read of one object has no pageSize to ask for fewer items with
      expect(overResult.warning).toMatch(
        /holds none of the result\. Narrow the request\.$/
      );
      expect(overResult.warning).not.toContain('pageSize');
      expect(keys.slice(0, 5)).toEqual([
        'toolName',
        'descriptorId',
        'truncated',
        'returned',
        'warning',
      ]);
      expect(keys.indexOf('warning')).toBeLessThan(keys.indexOf('data'));
      expect(keys.at(-1)).toBe('metadata');
    }
  );
}, 180000);

test('a list whose first item alone is too large is replaced, and nothing in it leads to a page that was not delivered', async () => {
  await withServer(
    [agent(OVER_ID, 300 * 1024), agent(FIT_ID, 10), agent(SMALL_ID, 10)],
    async (c) => {
      const text = await dispatch(c, 'agent.readAIAgents');

      expect(Buffer.byteLength(text)).toBeLessThan(4096);
      const result = JSON.parse(text);
      const keys = Object.keys(result);
      expect(result).toMatchObject({
        truncated: true,
        returned: 0,
        data: { _truncated: true },
      });
      expect(keys.indexOf('truncated')).toBeLessThan(keys.indexOf('returned'));
      expect(keys.indexOf('returned')).toBeLessThan(keys.indexOf('data'));
      expect(keys.indexOf('warning')).toBeLessThan(keys.indexOf('data'));
      expect(result).not.toHaveProperty('nextPageOffset');
      expect(result).not.toHaveProperty('nextPageToken');
      // the pagination that the library reports for a list says it too
      expect(result.metadata.pagination).toMatchObject({
        isPartial: true,
        returnedCount: 0,
      });
      expect(result.metadata.pagination).not.toHaveProperty('hasMore');
      expect(result.metadata.pagination).not.toHaveProperty('nextPageOffset');
      expect(result.metadata.pagination).not.toHaveProperty('warning');
      expect(text).not.toContain('Pass pageOffset');
      expect(result.warning).toContain(
        'Repeat the same request with a smaller pageSize; if a single item is too large, read it with a more specific read that names it by id; otherwise narrow the request.'
      );
    }
  );
}, 180000);

test('the result of frodo_find_skills is replaced too, and asks for a smaller limit, not a smaller pageSize', async () => {
  await withServer(
    [agent(SMALL_ID, 10)],
    async (c) => {
      // the limit of the call is not bounded: the whole catalog of an admin server is more than the inline limit
      const answer = await c.callTool({
        name: 'frodo_find_skills',
        arguments: { limit: 100000, executeRecommended: false },
      });
      expect(answer.isError).not.toBe(true);
      const text = answer.content[0].text;

      expect(Buffer.byteLength(text)).toBeLessThan(4096);
      const result = JSON.parse(text);
      const keys = Object.keys(result);
      expect(result).toMatchObject({
        toolName: 'frodo_find_skills',
        truncated: true,
        returned: 0,
        data: { _truncated: true },
      });
      expect(keys.indexOf('truncated')).toBeLessThan(keys.indexOf('returned'));
      expect(keys.indexOf('warning')).toBeLessThan(keys.indexOf('data'));
      expect(result.metadata.result.isTruncated).toBe(true);
      expect(result.metadata.result.payloadSizeBytes).toBeGreaterThan(
        INLINE_LIMIT_BYTES
      );
      expect(result.warning).toContain(
        'Repeat the same request with a smaller limit; otherwise narrow the request.'
      );
      expect(result.warning).not.toContain('pageSize');
    },
    'admin'
  );
}, 180000);

test('the server tells a client in its tool schema and its instructions how to read a list that was cut', async () => {
  await withServer([agent(SMALL_ID, 10)], async (c) => {
    const { tools } = await c.listTools();

    for (const name of ['frodo_dispatch_read_only', 'frodo_dispatch']) {
      const { properties } = tools.find(
        (tool) => tool.name === name
      ).inputSchema;
      expect(properties.pageSize.description).toBe(
        'Optional maximum number of items to return from a list or search. The server also cuts a result to a size limit, so fewer items can come back: check truncated, returned and total in the result.'
      );
      expect(properties.pageOffset.description).toBe(
        'Optional number of items to skip in a list or search. Pass nextPageOffset of the previous result to read the next page.'
      );
      expect(properties.pageToken.description).toBe(
        'Optional cursor for capabilities whose platform pages the result itself (for example log reads). Pass nextPageToken of the previous result.'
      );
    }
    const instructions = c.getInstructions();
    expect(instructions).toContain(
      'answer from execution.data, unless execution.truncated is true'
    );
    expect(instructions).toContain(
      'A list or search result says whether it is complete (truncated, returned, total)'
    );
  });
}, 180000);
