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

    expect(stdout).toContain(
        `MCP server info:\n  Frodo MCP Server v${cliVersion}\n`
    );
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

test("'mcp server start --verbose' emits info logs without routine stderr", async () => {
    const logs = [];
    const stderr = [];
    const client = await connectMcpClient(
        { supportedProtocolVersions: ['2025-11-25'] },
        { logs, stderr, extraArgs: ['--verbose'] }
    );

    try {
        await client.setLoggingLevel('info');
        await client.callTool({
            name: 'frodo_find_skills',
            arguments: { query: 'journey' },
        });

        expect(logs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    level: 'info',
                    logger: 'frodo-cli',
                    data: expect.stringContaining('Experimental feature'),
                }),
                expect.objectContaining({
                    level: 'info',
                    logger: 'frodo-cli',
                    data: expect.stringContaining('discovery: tool=frodo_find_skills'),
                }),
            ])
        );
        expect(stderr.join('')).not.toContain('Experimental feature in use');
        expect(stderr.join('')).not.toContain('MCP server startup summary');
    } finally {
        await client.close();
    }
});
