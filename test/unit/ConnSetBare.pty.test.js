import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * A bare `frodo conn set` only prints the settable fields, so on a real
 * terminal it must not open the profile picker or the Connection page
 * first. Naming a field without a host still needs a profile to edit, so
 * the picker stays there. Profiles are written by hand (a username and no
 * password), which is what opens the Connection page when nothing skips it.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const emptyCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
};

const hosts = [
  ['https://x.example.invalid/am', 'x'],
  ['https://y.example.invalid/am', 'y'],
];

suite('bare frodo conn set, on a real terminal', () => {
  let home;
  let profilesPath;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = createShellTestHome();
    profilesPath = path.join(home, 'Connections.json');
  });

  afterEach(() => {
    removeShellTestHome(home);
  });

  function saveProfiles(count) {
    fs.writeFileSync(
      profilesPath,
      JSON.stringify(
        Object.fromEntries(
          hosts.slice(0, count).map(([host, alias]) => [
            host,
            {
              tenant: host,
              alias,
              deploymentType: 'cloud',
              username: 'someone',
            },
          ])
        )
      )
    );
  }

  function run(args, regex) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...emptyCredentials,
        FRODO_CONNECTION_PROFILES_PATH: profilesPath,
      },
      args: ['conn', 'set', ...args],
      actions: [{ type: 'wait_plain', regex, timeoutMs: 10000 }],
    }).plainOutput;
  }

  test.each([
    ['one profile without a password', 1],
    ['several profiles', 2],
  ])('lists the fields without asking anything: %s', (_name, count) => {
    saveProfiles(count);
    const output = run([], 'Settable connection profile fields');
    expect(output).toContain('Settable connection profile fields');
    expect(output).toContain('--preferred-credential');
    expect(output).not.toContain('Choose a connection profile');
    expect(output).not.toContain('Connection:');
  });

  test('naming a field without a host still asks which profile', () => {
    saveProfiles(2);
    const output = run(['--alias', 'renamed'], 'Choose a connection profile');
    expect(output).toContain('Choose a connection profile');
    expect(output).not.toContain('Settable connection profile fields');
  });
});
