import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * On a terminal, the two RFC7523 commands ask for the option they cannot work
 * without instead of starting and failing later (cli#1000, cli#1001). Logins
 * go to a fake AM with a throwaway service account.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const noCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  NO_COLOR: '__FRODO_PTY_DELETE__',
};

suite('RFC7523 commands, on a real terminal', () => {
  let home;
  let fakeAm;
  let jwk;

  beforeAll(() => {
    ensureFrodoArtifact();
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    jwk = JSON.stringify(privateKey.export({ format: 'jwk' }));
  });

  beforeEach(async () => {
    home = createShellTestHome();
    fakeAm = await startFakeAm({
      recordPath: path.join(home, 'requests.jsonl'),
      journey: 'service-account',
    });
  });

  afterEach(() => {
    fakeAm?.stop();
    removeShellTestHome(home);
  });

  function onTerminal(command, args, actions) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
        FRODO_SA_ID: 'test-account',
        FRODO_SA_JWK: jwk,
      },
      args: [
        'admin',
        command,
        `http://127.0.0.1:${fakeAm.port}/am`,
        'alpha',
        '--type',
        'cloud',
        ...args,
      ],
      actions,
    });
  }

  test('generate asks for the issuer, then goes on', () => {
    const run = onTerminal(
      'generate-rfc7523-authz-grant-artefacts',
      ['--client-id', 'c1'],
      [
        {
          type: 'wait_plain',
          regex: 'Enter a value for --iss',
          timeoutMs: 30000,
        },
        { type: 'send', text: 'https://issuer.example.invalid' },
        { type: 'key', name: 'enter' },
        {
          type: 'wait_plain',
          regex: 'Generating RFC7523 authorization grant artefacts',
          timeoutMs: 30000,
        },
      ]
    );
    expect(run.plainOutput).toContain('Enter a value for --iss');
  });

  test('execute asks for the client id, then goes on', () => {
    const run = onTerminal(
      'execute-rfc7523-authz-grant-flow',
      ['--iss', 'https://issuer.example.invalid', '--sub', 'user-1'],
      [
        {
          type: 'wait_plain',
          regex: 'Enter a value for --client-id',
          timeoutMs: 30000,
        },
        { type: 'send', text: 'c1' },
        { type: 'key', name: 'enter' },
        {
          type: 'wait_plain',
          regex: 'Executing RFC7523 authorization grant flow',
          timeoutMs: 30000,
        },
      ]
    );
    expect(run.plainOutput).toContain('Enter a value for --client-id');
  });
});
