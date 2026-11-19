import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';

/**
 * A connection profile stores the values of the authentication and the
 * configuration header overrides encrypted, like the password (core 0013).
 * Needs a frodo-lib that does so; it fails against an older one, and the pull
 * request that adds it waits for the library release and its pin.
 *
 * Hand-written profiles in a temporary home, `--no-validate`, a master key
 * given as a made-up value in the environment of the child process (no key file
 * is read or created), made-up header values: no tenant, no real credential.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const HOST = 'https://openam-matrix.example.com/am';
const SECRETS = [
  'test-only-gateway-secret',
  'test-only-mutable-secret',
  'test-only-internal.example.com',
  'X-Gateway-Key',
  'X-Configuration-Type',
];
const noCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  FRODO_AUTHENTICATION_HEADER_OVERRIDES: '',
  FRODO_CONFIGURATION_HEADER_OVERRIDES: '',
  NO_COLOR: '__FRODO_PTY_DELETE__',
};

describe('header overrides in a connection profile', () => {
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

  function run(args, key = 'test-only-master-key') {
    const result = cp.spawnSync(
      process.execPath,
      [path.join(ROOT, 'dist/launch.cjs'), ...args],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          ...noCredentials,
          NO_COLOR: '1',
          HOME: home,
          FRODO_CONNECTION_PROFILES_PATH: profilesPath,
          FRODO_MASTER_KEY: key,
        },
      }
    );
    return {
      status: result.status,
      stdout: result.stdout,
      all: result.stdout + result.stderr,
    };
  }

  const file = () => fs.readFileSync(profilesPath, 'utf8');
  const profile = () => Object.values(JSON.parse(file()))[0];

  function savedByThisVersion() {
    const result = run([
      'conn',
      'save',
      '--no-validate',
      '--no-sa',
      '--no-log-api',
      '--alias',
      'matrix',
      '--authentication-header-overrides',
      '{"X-Gateway-Key":"test-only-gateway-secret","Host":"test-only-internal.example.com"}',
      '--configuration-header-overrides',
      '{"X-Configuration-Type":"test-only-mutable-secret"}',
      HOST,
      'neo',
      'not-a-real-password',
    ]);
    expect(result.status).toBe(0);
    expect(result.all).toContain('Saved connection profile');
    return result;
  }

  function writeOlderProfile() {
    fs.writeFileSync(
      profilesPath,
      JSON.stringify({
        [HOST]: {
          alias: 'matrix',
          deploymentType: 'cloud',
          username: 'neo',
          authenticationHeaderOverrides: {
            'X-Gateway-Key': 'test-only-gateway-secret',
            Host: 'test-only-internal.example.com',
          },
          configurationHeaderOverrides: {
            'X-Configuration-Type': 'test-only-mutable-secret',
          },
        },
      })
    );
  }

  it('conn save stores both maps encrypted: no value and no header name is in the file', () => {
    const saved = savedByThisVersion();

    for (const secret of SECRETS) {
      expect(file()).not.toContain(secret);
      expect(saved.all).not.toContain(secret);
    }
    expect(profile().encodedAuthenticationHeaderOverrides).toEqual(
      expect.any(String)
    );
    expect(profile().encodedConfigurationHeaderOverrides).toEqual(
      expect.any(String)
    );
    expect(profile().authenticationHeaderOverrides).toBeUndefined();
    expect(profile().configurationHeaderOverrides).toBeUndefined();
  });

  it('conn describe reads them back: names with [present], values with --show-secrets', () => {
    savedByThisVersion();

    const masked = run(['conn', 'describe', 'matrix']);
    expect(masked.status).toBe(0);
    expect(masked.stdout).toContain('X-Gateway-Key');
    expect(masked.stdout).toContain('X-Configuration-Type');
    expect(masked.stdout).toContain('[present]');
    for (const value of [
      'test-only-gateway-secret',
      'test-only-mutable-secret',
      'test-only-internal.example.com',
    ]) {
      expect(masked.all).not.toContain(value);
    }
    const shown = run(['conn', 'describe', 'matrix', '--show-secrets']);
    expect(shown.stdout).toContain('test-only-gateway-secret');
    expect(shown.stdout).toContain('test-only-mutable-secret');
    expect(shown.stdout).toContain('test-only-internal.example.com');
  });

  it('conn list shows no override, with or without --long', () => {
    savedByThisVersion();

    for (const args of [
      ['conn', 'list'],
      ['conn', 'list', '--long'],
    ]) {
      const { status, all } = run(args);
      expect(status).toBe(0);
      for (const secret of SECRETS) expect(all).not.toContain(secret);
    }
  });

  it('a master key that cannot decrypt them fails without printing a value', () => {
    savedByThisVersion();

    const { status, all } = run(['conn', 'describe', 'matrix'], 'another-key');

    expect(status).not.toBe(0);
    expect(all).toContain('Error decrypting connection profile');
    for (const secret of SECRETS) expect(all).not.toContain(secret);
  });

  describe('a profile saved with plain maps by an earlier version', () => {
    it('is read, and reading it does not rewrite it', () => {
      writeOlderProfile();
      const before = file();

      const described = run(['conn', 'describe', 'matrix', '--show-secrets']);

      expect(described.status).toBe(0);
      expect(described.stdout).toContain('test-only-gateway-secret');
      expect(described.stdout).toContain('test-only-mutable-secret');
      run(['conn', 'describe', 'matrix']);
      run(['conn', 'list', '--long']);
      expect(file()).toBe(before);
    });

    it('is encrypted by the next save, which keeps what the maps said', () => {
      writeOlderProfile();

      const set = run([
        'conn',
        'set',
        'matrix',
        '--username',
        'trinity',
        '--no-validate',
      ]);

      expect(set.status).toBe(0);
      for (const secret of SECRETS) expect(file()).not.toContain(secret);
      expect(profile().username).toBe('trinity');
      const shown = run(['conn', 'describe', 'matrix', '--show-secrets']);
      expect(shown.stdout).toContain('test-only-gateway-secret');
      expect(shown.stdout).toContain('test-only-mutable-secret');
    });
  });
});
