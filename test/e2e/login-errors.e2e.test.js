/**
 * `frodo login`'s argument-validation error paths (missing OAuth2 client id,
 * missing deployment type) fail before any network call, so — unlike
 * `frodo login`'s actual successful-login paths (plain username/password,
 * --device, --browser), which this suite has no way to record Polly
 * fixtures for without a real, reachable tenant — these run against the
 * real, built CLI with no mocking at all.
 *
 * NOTE: this intentionally does not cover a successful `frodo login`
 * (plain, --device, or --browser loopback-redirect). Those need either a
 * live tenant to record real HTTP fixtures against (Polly, like every other
 * e2e test in this suite) or a synthetic in-process browser-login server —
 * neither was available in the environment these tests were authored in.
 * See the plan doc's Phase F addendum.
 */
import cp from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

const TMP_DIR = path.resolve('./test/fs_tmp/login-errors-e2e');
const connectionProfilesPath = path.join(TMP_DIR, 'Connections.json');
const masterKeyPath = path.join(TMP_DIR, 'masterkey.key');
const tokenCachePath = path.join(TMP_DIR, 'TokenCache.json');

const env = {
  ...process.env,
  FRODO_CONNECTION_PROFILES_PATH: connectionProfilesPath,
  FRODO_MASTER_KEY_PATH: masterKeyPath,
  FRODO_TOKEN_CACHE_PATH: tokenCachePath,
};

beforeAll(() => {
  // Verify environment variables are properly set to prevent accidentally
  // writing to the user's real ~/.frodo/Connections.json.
  expect(env.FRODO_CONNECTION_PROFILES_PATH).toContain('login-errors-e2e');
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(connectionProfilesPath, '{}');
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('frodo login (argument-validation error paths)', () => {
  test('"frodo login --browser --type forgeops <host>" with no client id fails clearly, before any network call', async () => {
    await expect(
      exec(`frodo login --browser --type forgeops ${c.host}`, {
        env,
        cwd: process.cwd(),
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('requires an OAuth2 client id'),
    });
  });

  test('"frodo login --browser --type classic <host>" with no client id fails clearly, before any network call', async () => {
    await expect(
      exec(`frodo login --browser --type classic ${c.host}`, {
        env,
        cwd: process.cwd(),
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('requires an OAuth2 client id'),
    });
  });

  test('"frodo login --browser <host>" with no --type and no saved profile fails clearly, before any network call', async () => {
    await expect(
      exec(`frodo login --browser ${c.host}`, { env, cwd: process.cwd() })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('explicit deployment type'),
    });
  });
});
