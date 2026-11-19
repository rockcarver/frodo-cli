import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  test,
} from '@jest/globals';
import { parseHeaderOverrides } from '../../src/ops/ConnectionProfileOps.ts';
import { serializeCommand } from '../../src/utils/interactive/CommandPreview.ts';
import {
  readCommandDefaults,
  saveCommandDefaults,
  setDefaultsBaseDirForTests,
} from '../../src/utils/interactive/DefaultsStore.ts';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { fullName, loadCommandTree } from '../utils/CommandExamples.js';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';

/**
 * The values of the authentication and configuration header overrides are
 * secrets (core 0013). The options that carry them are secret options, so the
 * command preview masks them and no default is saved; `conn describe` masks
 * both maps; a value that is not valid JSON is reported without quoting it.
 *
 * Everything runs against hand-written profiles in a temporary home and
 * `--no-validate`: no tenant, no real credential. The values are made up.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const HOST = 'https://openam-matrix.example.com/am';
const OPTIONS = [
  ['frodo conn save', 'authenticationHeaderOverrides'],
  ['frodo conn save', 'configurationHeaderOverrides'],
  ['frodo conn set', 'authenticationHeaderOverrides'],
  ['frodo conn set', 'configurationHeaderOverrides'],
];
const SECRET_JSON = '{"X-Gateway-Key":"test-only-gateway-secret"}';
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

describe('parseHeaderOverrides', () => {
  it('reads a JSON object of header names and string values', () => {
    expect(
      parseHeaderOverrides('{"a":"1","B-c":"2"}', '--some-option')
    ).toEqual({ a: '1', 'B-c': '2' });
    expect(parseHeaderOverrides('{}', '--some-option')).toEqual({});
  });

  it.each([
    ['text that is not JSON', 'test-only-plain-secret-value'],
    ['JSON that is cut off', '{"X-Key":"test-only-cut-off-secret"'],
    ['JSON with a stray token', '{"X-Key":"test-only-stray-secret" x}'],
    ['a JSON array', '["test-only-array-secret"]'],
    ['a JSON string', '"test-only-string-secret"'],
    ['null', 'null'],
    ['a map with a value that is not a string', '{"X-Key":{"a":"b"}}'],
    ['a map with a number', '{"X-Key":1}'],
  ])('rejects %s without quoting it', (_label, value) => {
    let message = '';
    try {
      parseHeaderOverrides(value, '--some-option');
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('--some-option');
    expect(message).toContain('JSON object');
    // no part of the secret in the message: the quoted start of the text, that
    // JSON.parse puts into its own message, is the leak this guards
    expect(message).not.toMatch(/test-only/);
    expect(message).not.toContain(value);
  });
});

describe('the header override options of the real commands', () => {
  let commands;
  let baseDir;

  beforeAll(async () => {
    const { leaves } = await loadCommandTree();
    commands = Object.fromEntries(leaves.map((c) => [fullName(c), c]));
  });

  afterEach(() => {
    setDefaultsBaseDirForTests(undefined);
    if (baseDir) fs.rmSync(baseDir, { recursive: true, force: true });
    baseDir = undefined;
  });

  test.each(OPTIONS)(
    '%s: the command preview masks %s',
    (commandName, attributeName) => {
      const command = commands[commandName];
      command.setOptionValueWithSource(attributeName, SECRET_JSON, 'cli');
      try {
        const preview = serializeCommand(command);
        expect(preview).toContain('********');
        expect(preview).not.toContain('test-only-gateway-secret');
        expect(preview).not.toContain('X-Gateway-Key');
      } finally {
        command.setOptionValueWithSource(attributeName, undefined, 'default');
      }
    }
  );

  test.each(OPTIONS)(
    '%s: %s is never saved as a default',
    (commandName, attributeName) => {
      baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-defaults-'));
      setDefaultsBaseDirForTests(baseDir);
      const command = commands[commandName];

      saveCommandDefaults(command, {
        [attributeName]: SECRET_JSON,
        alias: 'matrix',
      });

      expect(readCommandDefaults(command)).toEqual({ alias: 'matrix' });
      for (const file of fs.readdirSync(baseDir, { recursive: true })) {
        const full = path.join(baseDir, file);
        if (fs.statSync(full).isFile()) {
          expect(fs.readFileSync(full, 'utf8')).not.toContain(
            'test-only-gateway-secret'
          );
        }
      }
    }
  );
});

describe('the header override options on the command line', () => {
  let home;
  let profilesPath;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = createShellTestHome();
    profilesPath = path.join(home, 'Connections.json');
    fs.writeFileSync(
      profilesPath,
      JSON.stringify({
        [HOST]: {
          tenant: HOST,
          alias: 'matrix',
          deploymentType: 'cloud',
          username: 'neo',
          authenticationHeaderOverrides: {
            'X-Gateway-Key': 'test-only-gateway-secret',
          },
          configurationHeaderOverrides: {
            'X-Configuration-Type': 'test-only-mutable-secret',
          },
        },
      })
    );
  });

  afterEach(() => {
    removeShellTestHome(home);
  });

  function run(args, input) {
    const result = cp.spawnSync(
      process.execPath,
      [path.join(ROOT, 'dist/launch.cjs'), ...args],
      {
        input,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...noCredentials,
          NO_COLOR: '1',
          HOME: home,
          FRODO_CONNECTION_PROFILES_PATH: profilesPath,
          // a key made up for the test, no key file is created
          FRODO_MASTER_KEY: 'test-only-master-key',
        },
      }
    );
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      all: result.stdout + result.stderr,
    };
  }

  describe('frodo conn describe', () => {
    it('shows the names of both maps and masks their values', () => {
      const { status, stdout, all } = run(['conn', 'describe', 'matrix']);

      expect(status).toBe(0);
      expect(stdout).toContain('Authentication Header Overrides');
      expect(stdout).toContain('X-Gateway-Key');
      expect(stdout).toContain('Configuration Header Overrides');
      expect(stdout).toContain('X-Configuration-Type');
      expect(stdout).toContain('[present]');
      expect(all).not.toContain('test-only-gateway-secret');
      expect(all).not.toContain('test-only-mutable-secret');
    });

    it('shows the values of both maps with --show-secrets', () => {
      const { status, stdout } = run([
        'conn',
        'describe',
        'matrix',
        '--show-secrets',
      ]);

      expect(status).toBe(0);
      expect(stdout).toContain('test-only-gateway-secret');
      expect(stdout).toContain('test-only-mutable-secret');
    });

    it('masks them with --verbose and --debug too', () => {
      const { all } = run([
        'conn',
        'describe',
        'matrix',
        '--verbose',
        '--debug',
      ]);

      expect(all).not.toContain('test-only-gateway-secret');
      expect(all).not.toContain('test-only-mutable-secret');
    });
  });

  describe('a value that is not valid', () => {
    it.each([
      [
        'conn save',
        ['conn', 'save', '--no-validate', '--no-sa', '--no-log-api'],
      ],
      ['conn set', ['conn', 'set', 'matrix', '--no-validate']],
    ])('%s fails without quoting it', (_name, base) => {
      for (const option of [
        '--authentication-header-overrides',
        '--configuration-header-overrides',
      ]) {
        const args =
          base[1] === 'save'
            ? [
                ...base,
                option,
                'test-only-plain-secret-value',
                HOST,
                'neo',
                'x',
              ]
            : [...base, option, 'test-only-plain-secret-value'];
        const { status, all } = run(args);

        expect(status).not.toBe(0);
        expect(all).toContain(option);
        expect(all).toContain('JSON object');
        expect(all).not.toContain('test-only-plain-secret-value');
      }
    });
  });

  describe('without a value', () => {
    it.each([
      '--authentication-header-overrides',
      '--configuration-header-overrides',
    ])('%s is still rejected, not asked for', (option) => {
      const { status, all } = run(
        ['conn', 'set', 'matrix', '--no-validate', option],
        '{"X-Piped":"test-only-piped-secret"}\n'
      );

      expect(status).not.toBe(0);
      expect(all).toContain('argument missing');
      expect(all).not.toContain('test-only-piped-secret');
    });
  });
});
