import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * The real CLI of this checkout, from the command line to the output: a login
 * that cannot work prints what frodo-lib found, then the advice of the CLI,
 * and exits with an error. No server and no tenant: both logins fail before
 * a request (no cached browser login; a host that reveals no deployment
 * type), and a temporary HOME keeps the run away from real profiles.
 */

const UNREACHABLE_HOST = 'http://127.0.0.1:9/am';

let home;

function frodo(args) {
  const result = cp.spawnSync(binaryPath, args, {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      FRODO_TEST: '',
      FRODO_NO_CACHE: 'true',
      NO_COLOR: '1',
      NODE_OPTIONS: '',
    },
    input: '',
    encoding: 'utf8',
    timeout: 60000,
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
}

const occurrences = (text, part) => text.split(part).length - 1;

beforeAll(() => {
  ensureFrodoArtifact();
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-login-hints-'));
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe('a login that cannot work, in the real CLI', () => {
  test('1: no cached browser login: the facts of the library, then the advice, once', () => {
    const { status, output } = frodo([
      'journey',
      'list',
      UNREACHABLE_HOST,
      'alpha',
      '--credential',
      'browser',
    ]);

    expect(status).toBe(1);
    expect(output).toContain(
      'No valid cached browser-login session exists for this host.'
    );
    expect(occurrences(output, "Run 'frodo login --browser' first.")).toBe(1);
    // the advice follows the error, and is not part of the library's sentence
    expect(output).not.toContain('host. Run');
  });

  test('2: frodo login --browser against a host that reveals no deployment type', () => {
    const { status, output } = frodo(['login', '--browser', UNREACHABLE_HOST]);

    expect(status).toBe(1);
    expect(output).toContain('could not determine the deployment type');
    expect(occurrences(output, 'Pass --type cloud, forgeops or classic')).toBe(
      1
    );
    expect(output).not.toMatch(/deployment type of .*: pass --type/);
  });
});
