/**
 * Several `mcp server start` processes of one host and identity share one
 * login through the token cache (frodo-cli#1055, frodo-lib#914). The test
 * starts real server processes against the fake AM (test/utils/FakeAm.mjs),
 * lets each serve several tool calls and counts the logins in the fake's
 * request log. A login starts with an empty `authenticate` request.
 *
 * The fake answers the journey read of a tool call with 404; what is counted
 * is the login, not the answer.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { startFakeAm } from '../../utils/StartFakeAm.js';

const cliPath = path.resolve('dist/launch.cjs');
const CALLS_PER_PROCESS = 5;

let testDirectory;
let fakeAm;
let recordPath;
let clients;

function requests() {
    if (!fs.existsSync(recordPath)) return [];
    return fs
        .readFileSync(recordPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

function loginCount() {
    return requests().filter(
        (request) =>
            request.method === 'POST' &&
            request.url.endsWith('/authenticate') &&
            request.body === '{}'
    ).length;
}

function journeyReadCount() {
    return requests().filter((request) =>
        request.url.includes('/authenticationtrees/trees')
    ).length;
}

async function startServer(extraArguments = [], environment = {}) {
    const client = new Client(
        { name: 'frodo-cli-test', version: '1.0.0' },
        { supportedProtocolVersions: ['2025-11-25'] }
    );
    // The jest setup switches the cache off for every test (FRODO_NO_CACHE);
    // the servers of this test are meant to use it.
    const env = {
        ...process.env,
        FRODO_TEST: '0',
        NO_COLOR: '1',
        FRODO_TOKEN_CACHE_PATH: path.join(testDirectory, 'TokenCache.json'),
        FRODO_MASTER_KEY_PATH: path.join(testDirectory, 'masterkey.key'),
        FRODO_CONNECTION_PROFILES_PATH: path.join(
            testDirectory,
            'Connections.json'
        ),
        ...environment,
    };
    delete env.FRODO_NO_CACHE;
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
            'read-only',
            '--profile',
            'authentication',
            ...extraArguments,
        ],
        env,
        cwd: testDirectory,
        stderr: 'pipe',
    });
    await client.connect(transport);
    clients.push(client);
    return client;
}

async function readJourneys(client) {
    return client.callTool({
        name: 'frodo_dispatch_read_only',
        arguments: { skillId: 'authn.journey.readJourneys' },
    });
}

beforeEach(async () => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-mcp-cache-'));
    recordPath = path.join(testDirectory, 'requests.jsonl');
    // The session expires in an hour, like a real one: the server schedules its
    // token refresh from the expiry, and Node cannot wait for a timer that is
    // more than about 24 days away.
    fakeAm = await startFakeAm({
        recordPath,
        journey: 'password',
        sessionTtlSeconds: 3600,
    });
    clients = [];
});

afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    fakeAm.stop();
    fs.rmSync(testDirectory, { recursive: true, force: true });
});

test("two 'mcp server start' processes share one login through the token cache", async () => {
    const first = await startServer();
    const second = await startServer();
    for (let call = 0; call < CALLS_PER_PROCESS; call++) {
        await readJourneys(first);
        await readJourneys(second);
    }

    expect(journeyReadCount()).toBe(2 * CALLS_PER_PROCESS);
    expect(loginCount()).toBe(1);
}, 60000);

test("'mcp server start --no-cache' logs in once per process, not once per tool call", async () => {
    const first = await startServer(['--no-cache']);
    const second = await startServer(['--no-cache']);
    for (let call = 0; call < CALLS_PER_PROCESS; call++) {
        await readJourneys(first);
        await readJourneys(second);
    }

    expect(journeyReadCount()).toBe(2 * CALLS_PER_PROCESS);
    expect(loginCount()).toBe(2);
}, 60000);

test("'mcp server start' still serves tool calls when the token cache cannot be written", async () => {
    // A directory cannot be created below a file: the cache is unusable, like
    // on a read-only home. The servers then log in once per process.
    fs.writeFileSync(path.join(testDirectory, 'not-a-directory'), '');
    const environment = {
        FRODO_TOKEN_CACHE_PATH: path.join(
            testDirectory,
            'not-a-directory',
            'TokenCache.json'
        ),
    };
    const first = await startServer([], environment);
    const second = await startServer([], environment);
    for (let call = 0; call < CALLS_PER_PROCESS; call++) {
        await readJourneys(first);
        await readJourneys(second);
    }

    expect(journeyReadCount()).toBe(2 * CALLS_PER_PROCESS);
    expect(loginCount()).toBe(2);
}, 60000);
