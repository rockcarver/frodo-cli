import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * The two RFC7523 commands need their inputs and say so (cli#1000, cli#1001):
 * `generate` cannot save a trusted issuer without an issuer, and `execute`
 * stops before it sends anything when it has no issuer, key or subject, and
 * shows AM's own reason when AM refuses. Runs use a fake AM and no terminal.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const launch = path.join(ROOT, 'dist/launch.cjs');

const noCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '1',
  NO_COLOR: '1',
};

describe('frodo admin generate/execute-rfc7523: required inputs', () => {
  let home;
  let fakeAm;
  let recordPath;
  let jwk;
  let jwkFile;

  beforeAll(() => {
    ensureFrodoArtifact();
    // a key made for this test run, never a committed one
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    jwk = { ...privateKey.export({ format: 'jwk' }), alg: 'RS256', kid: 'k1' };
  });

  beforeEach(() => {
    home = createShellTestHome();
    recordPath = path.join(home, 'requests.jsonl');
    jwkFile = path.join(home, 'given.jwk.json');
    fs.writeFileSync(jwkFile, JSON.stringify(jwk));
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    removeShellTestHome(home);
  });

  /** Runs the built CLI against the fake AM, from the test home. */
  function frodo(args, { host = true, env = {} } = {}) {
    const result = cp.spawnSync(
      process.execPath,
      [
        launch,
        'admin',
        ...args,
        ...(host ? [`http://127.0.0.1:${fakeAm.port}/am`, 'alpha'] : []),
        ...(host ? ['--type', 'cloud'] : []),
      ],
      {
        cwd: home,
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          ...noCredentials,
          HOME: home,
          FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
          FRODO_SA_ID: 'test-account',
          FRODO_SA_JWK: JSON.stringify(jwk),
          ...env,
        },
      }
    );
    return { ...result, output: result.stdout + result.stderr };
  }

  const requests = () =>
    fs.existsSync(recordPath)
      ? fs
          .readFileSync(recordPath, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  /** The requests the flow sent for its own client, not the login's. */
  const grantRequests = (clientId) =>
    requests().filter(
      (request) =>
        new URLSearchParams(request.body).get('client_id') === clientId
    );

  describe('options that cannot be left out', () => {
    test('generate asks for --iss and refuses to run without it', () => {
      const result = frodo(['generate-rfc7523-authz-grant-artefacts'], {
        host: false,
      });
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        "required option '--iss <issuer>' not specified"
      );
    });

    test('execute asks for --client-id and refuses to run without it', () => {
      const result = frodo(['execute-rfc7523-authz-grant-flow'], {
        host: false,
      });
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        "required option '--client-id <id>' not specified"
      );
    });

    test.each([
      ['generate-rfc7523-authz-grant-artefacts', '--iss <issuer>'],
      ['execute-rfc7523-authz-grant-flow', '--client-id <id>'],
    ])('%s help says %s is prompted for when missing', (command, flag) => {
      const result = cp.spawnSync(
        process.execPath,
        [launch, 'admin', command, '-h'],
        { encoding: 'utf8', env: { ...process.env, ...noCredentials } }
      );
      const line = (result.stdout + result.stderr)
        .split('\n')
        .find((l) => l.includes(flag));
      expect(line).toBeDefined();
      expect(line).toContain('(prompts if missing)');
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      fakeAm = await startFakeAm({ recordPath, journey: 'service-account' });
    });

    test('sends the issuer and subject it was given and prints the tokens', () => {
      const result = frodo([
        'execute-rfc7523-authz-grant-flow',
        '--client-id',
        'c1',
        '--iss',
        'https://issuer.example.invalid',
        '--sub',
        'user-1',
        '--jwk-file',
        jwkFile,
      ]);
      expect(result.status).toBe(0);
      expect(result.output).toContain('fake-service-account-token');
      const [sent] = grantRequests('c1');
      const assertion = new URLSearchParams(sent.body).get('assertion');
      const claims = JSON.parse(
        Buffer.from(assertion.split('.')[1], 'base64url').toString()
      );
      expect(claims.iss).toBe('https://issuer.example.invalid');
      expect(claims.sub).toBe('user-1');
    });

    test('shows why AM refused, not only that it did', () => {
      fakeAm.stop();
      return startFakeAm({
        recordPath,
        journey: 'service-account',
        grantError: "Missing 'iss' claim in JWT assertion",
      }).then((fake) => {
        fakeAm = fake;
        const result = frodo([
          'execute-rfc7523-authz-grant-flow',
          '--client-id',
          'c1',
          '--iss',
          'https://issuer.example.invalid',
          '--sub',
          'user-1',
          '--jwk-file',
          jwkFile,
        ]);
        expect(result.status).toBe(1);
        expect(result.output).toContain('invalid_grant');
        expect(result.output).toContain("Missing 'iss' claim in JWT assertion");
      });
    });

    test('without a key file it stops and sends nothing', () => {
      const result = frodo([
        'execute-rfc7523-authz-grant-flow',
        '--client-id',
        'c1',
        '--iss',
        'https://issuer.example.invalid',
        '--sub',
        'user-1',
      ]);
      expect(result.status).toBe(1);
      expect(result.output).toContain('No JWK provided');
      expect(result.output).toContain(
        'Nothing was sent. No value for --jwk-file'
      );
      expect(result.output).not.toContain('Progress indicator');
      expect(grantRequests('c1')).toHaveLength(0);
    });

    test('with a key file that is not JSON it stops and sends nothing', () => {
      fs.writeFileSync(jwkFile, 'not json');
      const result = frodo([
        'execute-rfc7523-authz-grant-flow',
        '--client-id',
        'c1',
        '--iss',
        'https://issuer.example.invalid',
        '--sub',
        'user-1',
        '--jwk-file',
        jwkFile,
      ]);
      expect(result.status).toBe(1);
      expect(result.output).toContain('Error parsing JWK from file');
      expect(grantRequests('c1')).toHaveLength(0);
    });

    test('with no issuer and no subject to find it names both options and sends nothing', () => {
      const result = frodo([
        'execute-rfc7523-authz-grant-flow',
        '--client-id',
        'c1',
        '--jwk-file',
        jwkFile,
      ]);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        'Nothing was sent. No value for --iss, --sub: give them on the command line.'
      );
      expect(result.output).not.toContain('undefined');
      expect(result.output).not.toContain('Progress indicator');
      expect(grantRequests('c1')).toHaveLength(0);
    });
  });

  describe('generate', () => {
    beforeEach(async () => {
      fakeAm = await startFakeAm({ recordPath, journey: 'service-account' });
    });

    test('a key file that cannot be read stops the run instead of making another key', () => {
      const result = frodo([
        'generate-rfc7523-authz-grant-artefacts',
        '--client-id',
        'c1',
        '--iss',
        'https://issuer.example.invalid',
        '--jwk-file',
        path.join(home, 'missing.jwk.json'),
      ]);
      expect(result.status).toBe(1);
      expect(result.output).toContain('Error parsing JWK from file');
      expect(
        requests().filter((r) => r.method !== 'GET' && r.method !== 'POST')
      ).toHaveLength(0);
      expect(fs.existsSync(path.join(home, 'c1_private.jwk.json'))).toBe(false);
    });
  });
});
