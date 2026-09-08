/**
 * `frodo session list`/`describe`/`delete` are pure local file operations
 * (no network calls at all — see src/ops/SessionOps.ts), so unlike most e2e
 * tests in this suite they need no Polly mocking. Instead this seeds a
 * cached browser-login session directly via frodo-lib, then exercises the
 * real, built CLI (`frodo session ...`) as a spawned subprocess against
 * that same, isolated token cache file, and asserts on its printed output.
 *
 * The seed step shells out to a plain `node -e` script requiring frodo-lib's
 * CJS build directly, rather than importing frodo-lib into this test file:
 * frodo-lib's ESM build has a pre-existing bundling issue with a
 * dynamic-require inside one of its CJS-only dependencies (axios's
 * form-data), which fails specifically under Jest's ESM runtime (unrelated
 * to this change) — plain `node` in CJS mode is unaffected.
 */
import cp from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';

const exec = promisify(cp.exec);

const TMP_DIR = path.resolve('./test/fs_tmp/session-e2e');
const tokenCachePath = path.join(TMP_DIR, 'TokenCache.json');
const masterKeyPath = path.join(TMP_DIR, 'masterkey.key');
const connectionProfilesPath = path.join(TMP_DIR, 'Connections.json');
const host = 'https://openam-session-e2e.example.com/am';

const env = {
  ...process.env,
  FRODO_TOKEN_CACHE_PATH: tokenCachePath,
  FRODO_MASTER_KEY_PATH: masterKeyPath,
  FRODO_CONNECTION_PROFILES_PATH: connectionProfilesPath,
};

async function seedCachedBrowserSession() {
  const script = `
    const { frodo, state } = require('@rockcarver/frodo-lib');
    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const accessToken = encode({ typ: 'JWT', alg: 'RS256' }) + '.' + encode({ sub: 'jdoe' }) + '.fake-signature';
    state.setHost(${JSON.stringify(host)});
    state.setTokenCachePath(${JSON.stringify(tokenCachePath)});
    state.setMasterKeyPath(${JSON.stringify(masterKeyPath)});
    state.setUseTokenCache(true);
    frodo.cache.saveToken('browserUserBearer', {
      access_token: accessToken,
      token_type: 'Bearer',
      scope: 'fr:idm:*',
      expires_in: 1800,
      expires: Date.now() + 1_800_000,
      // Item 23b: mirrors cloud's opportunistic getTokenInfo() capture at
      // fresh-login time (AuthenticateOps.ts) — 'describe' should surface
      // this straight from the cache, no network call.
      tokenInfo: { sub: 'jdoe', tokenName: 'Access Token', auditTrackingId: 'abc-123-audit' },
    }).then((ok) => { if (!ok) throw new Error('seed save returned false'); });
  `;
  await exec(`node -e "${script.replace(/"/g, '\\"')}"`, {
    cwd: process.cwd(),
  });
}

beforeAll(() => {
  // Verify environment variables are properly set to prevent accidentally
  // writing to the user's real ~/.frodo/TokenCache.json.
  expect(env.FRODO_TOKEN_CACHE_PATH).toContain('session-e2e');
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(connectionProfilesPath, '{}');
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('frodo session', () => {
  beforeEach(async () => {
    rmSync(tokenCachePath, { force: true });
    await seedCachedBrowserSession();
  });

  test('"frodo session list": lists the seeded cached session', async () => {
    const { stdout } = await exec('frodo session list', { env, cwd: process.cwd() });
    expect(stdout).toContain(host);
    // Human-readable Frodo Session Type label, not the raw internal
    // 'browserUserBearer' cache-key name.
    expect(stdout).toContain('Browser Login Access Token');
    expect(stdout).toContain('browser-login');
  });

  test('"frodo session describe <host>": describes the seeded cached session', async () => {
    // Console.ts routes 'info' messages (the "Cached session(s) for..."
    // header) to stderr and 'data' messages (the table) to stdout — see
    // conn-save.e2e.test.js's own convention of asserting on stderr for
    // confirmation-style messages.
    const { stdout, stderr } = await exec(`frodo session describe ${host}`, {
      env,
      cwd: process.cwd(),
    });
    expect(stderr).toContain(host);
    // "Session 1" heading with type/subject as properties, not
    // "browserUserBearer (subject)" as the heading itself.
    expect(stdout).toContain('Session 1');
    expect(stdout).toContain('Browser Login Access Token');
    // Item 23a: describe (unlike list) also decrypts a browserUserBearer
    // entry (master-key-derived, no extra credential needed) to surface
    // its granted scope and an "OAuth2 Access Token" vs "SSO Token" kind
    // label, straight from data already sitting in the seeded token.
    expect(stdout).toContain('OAuth2 Access Token');
    expect(stdout).toContain('fr:idm:*');
    // Item 23b: metadata captured once at login time (never a network call
    // from describe itself) is rendered as extra rows in the same nested
    // properties table — createObjectTable(), the same helper `frodo info`
    // uses for its own nested data.
    expect(stdout).toContain('Token Subject');
    expect(stdout).toContain('jdoe');
    expect(stdout).toContain('Token Name');
    expect(stdout).toContain('Access Token');
    expect(stdout).toContain('Audit Tracking ID');
    expect(stdout).toContain('abc-123-audit');
  });

  test('"frodo session describe <host-with-no-session>": reports no cached session', async () => {
    const { stderr } = await exec(
      'frodo session describe https://never-logged-in.example.com/am',
      { env, cwd: process.cwd() }
    );
    expect(stderr).toContain('No cached session');
  });

  test('"frodo session delete <host>": removes the cached session and notes it did not invalidate it server-side', async () => {
    const { stderr } = await exec(`frodo session delete ${host}`, {
      env,
      cwd: process.cwd(),
    });
    expect(stderr).toContain(`Deleted cached session for ${host}`);
    expect(stderr).toContain('did not invalidate the session');

    const { stderr: listAfterDelete } = await exec('frodo session list', {
      env,
      cwd: process.cwd(),
    });
    expect(listAfterDelete).toContain('No cached sessions');
  });

  test('"frodo session delete <host-with-no-session>": reports nothing to delete', async () => {
    const { stderr } = await exec(
      'frodo session delete https://never-logged-in.example.com/am',
      { env, cwd: process.cwd() }
    );
    expect(stderr).toContain('No cached session');
  });

  // An unresolvable alias/substring (no matching connection profile, and not
  // itself a full host URL) must be reported as unresolved, not silently
  // treated as a literal host that simply has no cached sessions — the two
  // are different failures and previously looked identical ("No cached
  // session for <raw-alias>"), which could read as "the delete/describe ran
  // against your host and found nothing" when it never resolved a host at
  // all.
  test('"frodo session describe <unresolvable-alias>": reports the alias could not be resolved, not "no cached session"', async () => {
    await expect(
      exec('frodo session describe not-a-real-alias', { env, cwd: process.cwd() })
    ).rejects.toThrow(
      /'not-a-real-alias' is not a full host URL and could not be resolved to a host from a connection profile/
    );
  });

  test('"frodo session delete <unresolvable-alias>": reports the alias could not be resolved, not "no cached session"', async () => {
    await expect(
      exec('frodo session delete not-a-real-alias', { env, cwd: process.cwd() })
    ).rejects.toThrow(
      /'not-a-real-alias' is not a full host URL and could not be resolved to a host from a connection profile/
    );
  });
});
