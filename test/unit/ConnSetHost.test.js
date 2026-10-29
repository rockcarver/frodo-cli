import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';

/**
 * Which profile `frodo conn set` edits: the host given on the command line
 * or, when there is none, FRODO_HOST (the command's own help lists it). With
 * neither it says that a host is needed instead of naming a profile called
 * `undefined` (cli#993). Every run is non-interactive, uses `--no-validate`
 * and a hand-written profiles file, so nothing reaches a tenant.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const HOST_A = 'https://a.example.invalid/am';
const HOST_B = 'https://b.example.invalid/am';
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

describe('frodo conn set: which profile it edits', () => {
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
        [HOST_A]: {
          tenant: HOST_A,
          alias: 'a1',
          deploymentType: 'cloud',
          username: 'someone',
        },
        [HOST_B]: {
          tenant: HOST_B,
          alias: 'b1',
          deploymentType: 'cloud',
          username: 'someone',
        },
      })
    );
  });

  afterEach(() => {
    removeShellTestHome(home);
  });

  const stored = () => JSON.parse(fs.readFileSync(profilesPath, 'utf8'));

  /** Runs the built CLI without a terminal. */
  function conn(args, env = {}) {
    const result = cp.spawnSync(
      process.execPath,
      [path.join(ROOT, 'dist/launch.cjs'), 'conn', 'set', ...args],
      {
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          ...noCredentials,
          HOME: home,
          FRODO_CONNECTION_PROFILES_PATH: profilesPath,
          ...env,
        },
      }
    );
    return { ...result, output: result.stdout + result.stderr };
  }

  describe('with no host at all', () => {
    test('says a host is needed, does not name a profile called undefined, and changes nothing', () => {
      const before = fs.readFileSync(profilesPath, 'utf8');
      const result = conn(['--alias', 'z', '--no-validate']);
      expect(result.status).toBe(1);
      expect(result.output).toContain('No host was given');
      expect(result.output).not.toContain('undefined');
      expect(result.output).not.toContain("'frodo conn save'");
      expect(fs.readFileSync(profilesPath, 'utf8')).toBe(before);
    });
  });

  describe('with FRODO_HOST and no host on the command line', () => {
    test('edits the profile for FRODO_HOST', () => {
      const result = conn(['--alias', 'z', '--no-validate'], {
        FRODO_HOST: HOST_A,
      });
      expect(result.status).toBe(0);
      expect(result.output).toContain(`Saved connection profile ${HOST_A}`);
      expect(stored()[HOST_A].alias).toBe('z');
      expect(stored()[HOST_B].alias).toBe('b1');
    });

    test('accepts an alias in FRODO_HOST, like the host argument does', () => {
      const result = conn(['--alias', 'z', '--no-validate'], {
        FRODO_HOST: 'b1',
      });
      expect(result.status).toBe(0);
      expect(stored()[HOST_B].alias).toBe('z');
      expect(stored()[HOST_A].alias).toBe('a1');
    });

    test('a FRODO_HOST that is not saved is reported by name, and nothing is created', () => {
      const before = fs.readFileSync(profilesPath, 'utf8');
      const result = conn(['--alias', 'z', '--no-validate'], {
        FRODO_HOST: 'https://nosuch.example.invalid/am',
      });
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        "No connection profile found for 'https://nosuch.example.invalid/am'."
      );
      expect(result.output).not.toContain('undefined');
      expect(fs.readFileSync(profilesPath, 'utf8')).toBe(before);
    });

    test('the host argument wins over FRODO_HOST', () => {
      const result = conn(['b1', '--alias', 'z', '--no-validate'], {
        FRODO_HOST: HOST_A,
      });
      expect(result.status).toBe(0);
      expect(stored()[HOST_B].alias).toBe('z');
      expect(stored()[HOST_A].alias).toBe('a1');
    });

    test('names FRODO_HOST in the error when there is no host at all', () => {
      const result = conn(['--alias', 'z', '--no-validate']);
      expect(result.output).toContain('FRODO_HOST');
    });
  });

  describe('with a host on the command line', () => {
    test('a host that is not saved is reported by name, with the way to create it', () => {
      const result = conn(['nosuch', '--alias', 'z', '--no-validate']);
      expect(result.status).toBe(1);
      expect(result.output).toContain(
        "No connection profile found for 'nosuch'. Create one first with 'frodo conn save'."
      );
    });

    test('edits that profile', () => {
      const result = conn(['a1', '--alias', 'z', '--no-validate']);
      expect(result.status).toBe(0);
      expect(stored()[HOST_A].alias).toBe('z');
      expect(stored()[HOST_B].alias).toBe('b1');
    });
  });
});
