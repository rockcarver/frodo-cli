import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const execFile = promisify(cp.execFile);
const cliPath = path.resolve('dist/launch.cjs');
const cliVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-mcp-cli-'));
const commandEnvironment = {
    ...process.env,
    FRODO_CONNECTION_PROFILES_PATH: path.join(testDirectory, 'Connections.json'),
    FRODO_TEST: '0',
    NO_COLOR: '1',
};

async function runMcpCommand(...args) {
    const { stdout, stderr } = await execFile(
        process.execPath,
        [cliPath, 'mcp', 'server', ...args],
        {
            env: commandEnvironment,
            maxBuffer: 10 * 1024 * 1024,
        }
    );
    return stdout || stderr;
}

function parseJsonOutput(stdout) {
    return JSON.parse(stdout.slice(stdout.indexOf('{')));
}

async function connectMcpClient(options, testOptions = {}) {
    const client = new Client(
        { name: 'frodo-cli-test', version: '1.0.0' },
        options
    );
    if (testOptions.logs) {
        client.setNotificationHandler(
            'notifications/message',
            async (notification) => {
                testOptions.logs.push(notification.params);
            }
        );
    }
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [
            cliPath,
            'mcp',
            'server',
            'start',
            '--policy',
            'read-only',
            '--profile',
            'authentication',
            ...(testOptions.extraArgs ?? []),
        ],
        env: commandEnvironment,
        cwd: testDirectory,
        stderr: 'pipe',
    });
    if (testOptions.stderr) {
        transport.stderr?.on('data', (chunk) => {
            testOptions.stderr.push(chunk.toString());
        });
    }
    await client.connect(transport);
    return client;
}

afterAll(() => {
    fs.rmSync(testDirectory, { recursive: true, force: true });
});

test("'mcp server info' prints the active server summary", async () => {
    const stdout = await runMcpCommand('info', '--policy', 'admin');

    expect(stdout).toContain('MCP server info:\n  Frodo MCP Server\n');
    // Build timestamps are real and change every build, so these check the
    // stable `cli: vX (` / `lib: vY (` prefix plus a real ISO 8601 value
    // rather than an exact match.
    expect(stdout).toMatch(
        new RegExp(` {2}cli: v${cliVersion} \\(\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z\\)\\n`)
    );
    expect(stdout).toMatch(/ {2}lib: v[\d.]+ \(\d{4}-\d{2}-\d{2}T[\d:.]+Z\)\n/);
    expect(stdout).toContain(
        '  Supported protocol versions: 2026-07-28, 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07\n'
    );
    expect(stdout).toContain('  Active profile: all\n  Active policy: admin\n');
    expect(stdout).toMatch(/  Active skills: (\d+) \(total: \1\)\n/);
    expect(stdout).toContain('  Active tools: 5 (4 canonical, 1 discovery)\n');

    const info = parseJsonOutput(
        await runMcpCommand('info', '--policy', 'admin', '--json')
    );
    expect(info.protocol).toEqual({
        supportedVersions: [
            '2026-07-28',
            '2025-11-25',
            '2025-06-18',
            '2025-03-26',
            '2024-11-05',
            '2024-10-07',
        ],
    });
});

test("'mcp server profiles' lists registered profiles", async () => {
    const stdout = await runMcpCommand('profiles');

    expect(stdout).toContain('MCP profiles (8):');
    expect(stdout).toContain('- all:');
    expect(stdout).toContain('- authentication:');
});

test("'mcp server policies' returns all policy presets", async () => {
    const info = parseJsonOutput(await runMcpCommand('policies', '--json'));

    expect(info.total).toBe(4);
    expect(info.presets.map((preset) => preset.name)).toEqual([
        'read-only',
        'agentic',
        'standard',
        'admin',
    ]);
});

test("'mcp server skills' applies profile, policy, and limit", async () => {
    const info = parseJsonOutput(
        await runMcpCommand(
            'skills',
            '--policy',
            'read-only',
            '--profile',
            'authentication',
            '--limit',
            '1',
            '--json'
        )
    );

    expect(info.profile).toBe('authentication');
    expect(info.policy).toBe('read-only');
    expect(info.totalFiltered).toBeGreaterThan(0);
    expect(info.limit).toBe(1);
    expect(info.skills).toHaveLength(1);
});

test("'mcp server tools' preserves the canonical five-tool surface", async () => {
    const info = parseJsonOutput(
        await runMcpCommand(
            'tools',
            '--policy',
            'read-only',
            '--profile',
            'authentication',
            '--json'
        )
    );

    expect(info.policy).toBe('read-only');
    expect(info.total).toBe(5);
    expect(info.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
            'frodo_find_skills',
            'frodo_describe_skill',
            'frodo_dispatch_read_only',
            'frodo_dispatch',
            'frodo_discover',
        ])
    );
});

test("'mcp server start --dry-run' validates service composition", async () => {
    const info = parseJsonOutput(
        await runMcpCommand(
            'start',
            '--policy',
            'read-only',
            '--profile',
            'authentication',
            '--dry-run',
            '--json'
        )
    );

    expect(info.policy).toBe('read-only');
    expect(info.profile).toBe('authentication');
    expect(info.transport).toBe('stdio');
    expect(info.toolCounts).toEqual({ total: 5, canonical: 4, discovery: 1 });
    expect(info.skillCount).toBeGreaterThan(0);
});

test("'mcp server start' negotiates the 2026-07-28 protocol", async () => {
    const client = await connectMcpClient({
        supportedProtocolVersions: ['2026-07-28'],
        versionNegotiation: { mode: { pin: '2026-07-28' } },
    });

    try {
        expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');
        expect((await client.listTools()).tools).toHaveLength(5);
        expect(
            fs.existsSync(path.join(testDirectory, 'frodo-lib-debug.log'))
        ).toBe(false);
    } finally {
        await client.close();
    }
});

test("'mcp server start' remains compatible with legacy clients", async () => {
    const client = await connectMcpClient({
        supportedProtocolVersions: ['2025-11-25'],
    });

    try {
        expect(client.getNegotiatedProtocolVersion()).toBe('2025-11-25');
        expect((await client.listTools()).tools).toHaveLength(5);
    } finally {
        await client.close();
    }
});

test("'mcp server start' advertises experimental claude/channel capability", async () => {
    const client = await connectMcpClient({
        supportedProtocolVersions: ['2026-07-28'],
        versionNegotiation: { mode: { pin: '2026-07-28' } },
    });

    try {
        const capabilities = client.getServerCapabilities();
        expect(capabilities).toBeDefined();
        expect(capabilities?.experimental).toBeDefined();
        expect(capabilities?.experimental?.['claude/channel']).toBeDefined();
        expect(typeof capabilities?.experimental?.['claude/channel']).toBe('object');
    } finally {
        await client.close();
    }
});

test("'mcp server start' does not emit unsolicited notifications/message for 2026-07-28 clients", async () => {
    const logs = [];
    const stderr = [];
    const client = await connectMcpClient(
        {
            supportedProtocolVersions: ['2026-07-28'],
            versionNegotiation: { mode: { pin: '2026-07-28' } },
        },
        { logs, stderr }
    );

    try {
        await client.callTool({
            name: 'frodo_find_skills',
            arguments: { query: 'journey' },
        });

        // Modern 2026-07-28 clients never send notifications/initialized, so
        // oninitialized never fires and attachSink is never called. Startup
        // (unsolicited) logs must not appear in notifications/message.
        // Per-request trace notifications (solicited, from the tool call above)
        // may still be present — those are out of scope for this assertion (AD-5).
        const startupLogs = logs.filter((entry) =>
            String(entry.data).startsWith('startup:')
        );
        expect(startupLogs).toEqual([]);
        // Startup log visibility is preserved via process.stderr (Task 2).
        expect(stderr.join('')).toContain(
            '[frodo-mcp] info: startup: Experimental feature in use'
        );
    } finally {
        await client.close();
    }
});

test("'mcp server start' emits info logs without routine stderr", async () => {
    const logs = [];
    const stderr = [];
    const client = await connectMcpClient(
        { supportedProtocolVersions: ['2025-11-25'] },
        { logs, stderr }
    );

    try {
        await client.setLoggingLevel('info');
        await client.callTool({
            name: 'frodo_find_skills',
            arguments: { query: 'journey' },
        });

        const findSkillsLogs = logs.filter((entry) =>
            entry.data.includes('discovery: tool=frodo_find_skills')
        );
        expect(findSkillsLogs).toHaveLength(1);
        expect(findSkillsLogs[0]).toEqual(
            expect.objectContaining({
                level: 'info',
                logger: 'frodo-cli',
                data: expect.stringMatching(
                    /criteria=\[query="journey"\] candidates=\d+ results=\d+ topCandidates=\[authn\..+\((preferred|compatible|unknown|incompatible)\)/
                ),
            })
        );
        expect(logs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    level: 'info',
                    logger: 'frodo-cli',
                    data: expect.stringContaining('Experimental feature'),
                }),
            ])
        );
        expect(stderr.join('')).toContain(
            '[frodo-mcp] info: startup: Experimental feature in use'
        );
        expect(stderr.join('')).toContain(
            '[frodo-mcp] info: discovery: tool=frodo_find_skills'
        );
        expect(stderr.join('')).not.toContain('MCP server startup summary');
    } finally {
        await client.close();
    }
});

test("'mcp server start --mcp-log-level debug' logs structured find-skills criteria at info level", async () => {
    const logs = [];
    const stderr = [];
    const client = await connectMcpClient(
        { supportedProtocolVersions: ['2025-11-25'] },
        { logs, stderr, extraArgs: ['--mcp-log-level', 'debug'] }
    );

    try {
        await client.callTool({
            name: 'frodo_find_skills',
            arguments: {
                domain: 'authn',
                objectType: 'Journey',
                operationTypes: ['read'],
                limit: 5,
            },
        });

        expect(logs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    level: 'info',
                    logger: 'frodo-cli',
                    data: expect.stringMatching(
                        /criteria=\[domain=authn objectType=Journey operations=read limit=5\] candidates=\d+ results=\d+ topCandidates=\[authn\..+\((preferred|compatible|unknown|incompatible)\)/
                    ),
                }),
            ])
        );
        expect(stderr.join('')).not.toContain('AuthenticateOps.');
        expect(stderr.join('')).not.toContain('ServiceAccountOps.');
    } finally {
        await client.close();
    }
});

test.each(['--debug', '--verbose'])(
    'legacy %s does not override --mcp-log-level off',
    async (legacyOption) => {
        const logs = [];
        const client = await connectMcpClient(
            { supportedProtocolVersions: ['2025-11-25'] },
            {
                logs,
                extraArgs: [legacyOption, '--mcp-log-level', 'off'],
            }
        );

        try {
            await client.setLoggingLevel('debug');
            await client.callTool({
                name: 'frodo_find_skills',
                arguments: { query: 'journey' },
            });

            expect(logs).toEqual([]);
        } finally {
            await client.close();
        }
    }
);

test.each(['error', 'warn'])(
    "'mcp server start --mcp-log-level %s' suppresses info logs",
    async (level) => {
        const logs = [];
        const client = await connectMcpClient(
            { supportedProtocolVersions: ['2025-11-25'] },
            {
                logs,
                extraArgs: ['--mcp-log-level', level],
            }
        );

        try {
            await client.setLoggingLevel('debug');
            await client.callTool({
                name: 'frodo_find_skills',
                arguments: { query: 'journey' },
            });
            expect(logs).toEqual([]);
        } finally {
            await client.close();
        }
    }
);

test('client info level receives find-skills candidate details', async () => {
    const logs = [];
    const client = await connectMcpClient(
        { supportedProtocolVersions: ['2025-11-25'] },
        { logs, extraArgs: ['--mcp-log-level', 'debug'] }
    );

    try {
        await client.setLoggingLevel('info');
        logs.length = 0;
        await client.callTool({
            name: 'frodo_find_skills',
            arguments: { query: 'journey' },
        });

        expect(logs.some((entry) => entry.level === 'info')).toBe(true);
        expect(
            logs.some(
                (entry) =>
                    entry.level === 'info' &&
                    entry.data.includes('topCandidates=')
            )
        ).toBe(true);
        expect(logs.some((entry) => entry.level === 'debug')).toBe(false);
    } finally {
        await client.close();
    }
});
