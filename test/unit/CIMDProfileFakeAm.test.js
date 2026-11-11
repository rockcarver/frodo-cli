import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * `frodo agent cimd` driven through the REAL CLI of this checkout against the
 * fake AM of test/utils/FakeAm.mjs in a separate process, with no tenant and no
 * recording: a deployment that does not offer the CIMDProfile agent type (the
 * type list answers 404, as the `password` journey of the fake does for every
 * path it does not know; the Cloud root realm answers the 403 "not available"
 * of Identity Cloud) and a deployment that does, whose profiles are served the
 * way the real server serves them (the list plain, a read by id wrapped).
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const profile = (id, pattern, more = {}) => ({
  _id: id,
  _rev: '-1122334455',
  _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
  cimdConfig: {
    cimdSsrfProtectionEnabled: true,
    cimdMetadataDenyList: ['scope'],
    cimdClientIdUrlPatterns: [pattern],
  },
  coreOAuth2ClientConfig: { status: 'Active', scopes: ['openid'] },
  advancedOAuth2ClientConfig: { grantTypes: ['authorization_code'] },
  ...more,
});

const PROFILES = [
  profile('zion-mcp-clients', 'https://agents.zion.example.com/*'),
  profile('alpha-clients', 'https://alpha.zion.example.com/*', {
    coreOAuth2ClientConfig: { status: 'Inactive' },
  }),
];

const NOT_AVAILABLE = /CIMD profiles are not available in the .* realm of /;

suite('agent cimd through the CLI', () => {
  let home;
  let work;
  const fakes = [];

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  afterAll(() => {
    for (const fake of fakes) fake.stop();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-cimd-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-cimd-work-'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts a fake AM that is stopped when the suite ends. */
  async function fake(options) {
    const started = await startFakeAm({ journey: 'password', ...options });
    fakes.push(started);
    return started;
  }

  /** Runs `frodo <args>` in the working directory and answers its exit code and both outputs. */
  function run(args) {
    return new Promise((resolve, reject) => {
      const child = cp.spawn(binaryPath, args, {
        cwd: work,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FRODO_TEST: '',
          FRODO_NO_CACHE: 'true',
          NODE_OPTIONS: '',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
  }

  const onFake = (server, args, realm = 'alpha') => [
    ...args,
    `http://127.0.0.1:${server.port}/am`,
    realm,
    'someone',
    'secret',
    '-m',
    'classic',
  ];

  describe('on a deployment that does not offer the type', () => {
    let server;

    beforeAll(async () => {
      // no agent type list at all: it answers 404, which the library reads as "no types"
      server = await fake({});
    });

    it(
      'list prints the note on stderr, nothing on stdout, and exits 0',
      async () => {
        const { code, stdout, stderr } = await run(
          onFake(server, ['agent', 'cimd', 'list'])
        );

        expect(stderr).toMatch(NOT_AVAILABLE);
        expect(stderr).toContain(
          "the server does not offer the agent type 'CIMDProfile'"
        );
        expect(stdout).toBe('');
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'list --long behaves the same',
      async () => {
        const { code, stdout, stderr } = await run(
          onFake(server, ['agent', 'cimd', 'list', '--long'])
        );

        expect(stderr).toMatch(NOT_AVAILABLE);
        expect(stdout).toBe('');
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'export -a and -A write nothing and exit 0, export -i exits 1',
      async () => {
        const all = await run(
          onFake(server, ['agent', 'cimd', 'export', '-a', '-D', 'out'])
        );
        const separate = await run(
          onFake(server, ['agent', 'cimd', 'export', '-A', '-D', 'out'])
        );
        const one = await run(
          onFake(server, ['agent', 'cimd', 'export', '-i', 'x', '-D', 'out'])
        );

        expect(all.stderr).toMatch(NOT_AVAILABLE);
        expect(all.code).toBe(0);
        expect(separate.stderr).toMatch(NOT_AVAILABLE);
        expect(separate.code).toBe(0);
        expect(one.stderr).toMatch(NOT_AVAILABLE);
        expect(one.code).toBe(1);
        expect(fs.existsSync(path.join(work, 'out'))).toBe(false);
        expect(fs.readdirSync(work)).toEqual([]);
      },
      TIMEOUT
    );

    it(
      'describe -i names a profile that cannot exist: the error of the library and exit 1',
      async () => {
        const { code, stdout, stderr } = await run(
          onFake(server, ['agent', 'cimd', 'describe', '-i', 'x'])
        );

        expect(stderr).toMatch(NOT_AVAILABLE);
        expect(stderr).not.toMatch(/\n\s+at /);
        expect(stdout).toBe('');
        expect(code).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('on a deployment that offers the type', () => {
    let server;

    beforeAll(async () => {
      server = await fake({
        agentTypes: ['CIMDProfile', 'WebAgent'],
        cimdProfiles: structuredClone(PROFILES),
      });
    });

    it(
      'list prints the ids and nothing else on stdout',
      async () => {
        const { code, stdout, stderr } = await run(
          onFake(server, ['agent', 'cimd', 'list'])
        );

        expect(stdout.split('\n').filter(Boolean)).toEqual([
          'alpha-clients',
          'zion-mcp-clients',
        ]);
        expect(stderr).toBe('');
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'list --long prints the status, the patterns and the SSRF protection',
      async () => {
        const { code, stdout } = await run(
          onFake(server, ['agent', 'cimd', 'list', '--long'])
        );

        expect(stdout).toMatch(
          /alpha-clients\s*│Inactive\s*│https:\/\/alpha\.zion\.example\.com\/\*\s*│enabled/
        );
        expect(stdout).toMatch(
          /zion-mcp-clients\s*│Active\s*│https:\/\/agents\.zion\.example\.com\/\*\s*│enabled/
        );
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'describe -i --json prints the profile as the list read it, plain',
      async () => {
        const { code, stdout } = await run(
          onFake(server, [
            'agent',
            'cimd',
            'describe',
            '-i',
            'zion-mcp-clients',
            '--json',
          ])
        );

        expect(JSON.parse(stdout)).toEqual(PROFILES[0]);
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'describe -i matches the id ignoring case and prints the table',
      async () => {
        const { code, stdout } = await run(
          onFake(server, [
            'agent',
            'cimd',
            'describe',
            '-i',
            'ZION-MCP-CLIENTS',
          ])
        );

        expect(stdout).toMatch(/Agent Id\s*│zion-mcp-clients/);
        expect(stdout).toMatch(/Status\s*│Active/);
        expect(stdout).toMatch(
          /Client ID URL patterns\s*│https:\/\/agents\.zion\.example\.com\/\*/
        );
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    describe('export', () => {
      const exported = (name) =>
        JSON.parse(fs.readFileSync(path.join(work, 'out', name), 'utf8'));
      const files = () => fs.readdirSync(path.join(work, 'out')).sort();

      it(
        '-i, -a and -A write the files with the profile in one shape (the file of -i has the profile of -a and -A)',
        async () => {
          const one = await run(
            onFake(server, [
              'agent',
              'cimd',
              'export',
              '-i',
              'ZION-MCP-CLIENTS',
              '-D',
              'out',
            ])
          );
          const all = await run(
            onFake(server, ['agent', 'cimd', 'export', '-a', '-D', 'out'])
          );
          const separate = await run(
            onFake(server, ['agent', 'cimd', 'export', '-A', '-D', 'out'])
          );

          expect([one.code, all.code, separate.code]).toEqual([0, 0, 0]);
          expect(files()).toEqual([
            'allAlphaAgents.cimd.agent.json',
            'alpha-clients.cimd.agent.json',
            'zion-mcp-clients.cimd.agent.json',
          ]);
          // the server's own _rev is not in a file (the library drops it on save)
          const { _rev, ...expected } = PROFILES[0];
          expect(_rev).toBeDefined();
          expect(
            exported('zion-mcp-clients.cimd.agent.json').cimdProfile
          ).toEqual({ 'zion-mcp-clients': expected });
          expect(
            exported('allAlphaAgents.cimd.agent.json').cimdProfile[
              'zion-mcp-clients'
            ]
          ).toEqual(expected);
          expect(
            Object.keys(exported('allAlphaAgents.cimd.agent.json').cimdProfile)
          ).toEqual(['alpha-clients', 'zion-mcp-clients']);
        },
        TIMEOUT
      );

      it(
        '-i with -f and -N writes the named file without metadata',
        async () => {
          const { code } = await run(
            onFake(server, [
              'agent',
              'cimd',
              'export',
              '-i',
              'zion-mcp-clients',
              '-f',
              'mine.json',
              '-N',
              '-D',
              'out',
            ])
          );

          expect(code).toBe(0);
          expect(files()).toEqual(['mine.json']);
          expect(Object.keys(exported('mine.json'))).toEqual(['cimdProfile']);
        },
        TIMEOUT
      );

      it(
        '-A with a file that cannot be written names that profile, writes the others and exits 1; with --allow-failures it exits 0',
        async () => {
          // a folder where the file of one profile should go
          fs.mkdirSync(
            path.join(work, 'out', 'alpha-clients.cimd.agent.json'),
            {
              recursive: true,
            }
          );
          const failing = await run(
            onFake(server, ['agent', 'cimd', 'export', '-A', '-D', 'out'])
          );
          const allowed = await run(
            onFake(server, [
              'agent',
              'cimd',
              'export',
              '-A',
              '-D',
              'out',
              '--allow-failures',
            ])
          );

          expect(failing.stderr).toMatch(
            /1 of 2 profiles failed:\n\s+- alpha-clients/
          );
          expect(failing.stderr).not.toContain('--allow-failures was given');
          expect(failing.code).toBe(1);
          expect(allowed.stderr).toMatch(/1 of 2 profiles failed:/);
          expect(allowed.stderr).toContain(
            'The exit code stays 0 because --allow-failures was given.'
          );
          expect(allowed.code).toBe(0);
          expect(
            exported('zion-mcp-clients.cimd.agent.json').cimdProfile
          ).toHaveProperty('zion-mcp-clients');
        },
        TIMEOUT
      );

      it(
        '-i of an unknown id exits 1 and writes nothing',
        async () => {
          const { code, stderr } = await run(
            onFake(server, [
              'agent',
              'cimd',
              'export',
              '-i',
              'missing',
              '-D',
              'out',
            ])
          );

          expect(stderr).toContain('CIMD profile missing not found');
          expect(code).toBe(1);
          expect(fs.existsSync(path.join(work, 'out'))).toBe(false);
        },
        TIMEOUT
      );
    });

    it(
      'describe -i of an unknown id exits 1 and says so',
      async () => {
        const { code, stdout, stderr } = await run(
          onFake(server, ['agent', 'cimd', 'describe', '-i', 'missing'])
        );

        expect(stderr).toContain('CIMD profile missing not found');
        expect(stdout).toBe('');
        expect(code).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('on the root realm of a Cloud tenant, which answers that the operation is not available', () => {
    let server;

    beforeAll(async () => {
      server = await fake({
        agentTypes: ['CIMDProfile'],
        cimdProfiles: structuredClone(PROFILES),
        cimdRootDenied: true,
      });
    });

    it(
      'list on the root realm prints the note and exits 0, in the realm that offers the type it lists',
      async () => {
        const root = await run(onFake(server, ['agent', 'cimd', 'list'], '/'));
        const alpha = await run(
          onFake(server, ['agent', 'cimd', 'list'], 'alpha')
        );

        expect(root.stderr).toMatch(NOT_AVAILABLE);
        expect(root.stderr).toContain('in the root realm of ');
        expect(root.stdout).toBe('');
        expect(root.code).toBe(0);
        expect(alpha.stdout.split('\n').filter(Boolean)).toEqual([
          'alpha-clients',
          'zion-mcp-clients',
        ]);
        expect(alpha.code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'describe -i on the root realm exits 1 with the error of the library',
      async () => {
        const { code, stderr } = await run(
          onFake(
            server,
            ['agent', 'cimd', 'describe', '-i', 'zion-mcp-clients'],
            '/'
          )
        );

        expect(stderr).toMatch(NOT_AVAILABLE);
        expect(code).toBe(1);
      },
      TIMEOUT
    );
  });
});
