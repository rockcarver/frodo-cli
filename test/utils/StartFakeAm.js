import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const fakeAmPath = fileURLToPath(new URL('./FakeAm.mjs', import.meta.url));

/**
 * Starts test/utils/FakeAm.mjs as a SEPARATE process (a terminal driver that
 * blocks this process's event loop could not be answered by an in-process
 * server) and resolves once it is listening.
 *
 * @param {object} [options]
 * @param {string} [options.recordPath] file the fake appends one JSON line per request to
 * @param {string} [options.journey] `password` for plain login, `service-account` for bearer login (default: the MFA journey)
 * @param {string} [options.grantError] makes the service-account journey refuse other token requests with `invalid_grant` and this description
 * @param {{ issuer?: string, allowedSubjects: string[] }} [options.issuer] what every trusted JWT issuer read answers with
 * @param {number} [options.sessionTtlSeconds] lifetime of the session of a plain login, from the moment it is looked up (default: it expires in 2099)
 * @param {'refuse' | 'hang'} [options.logout] makes the logout call fail with `400` (`refuse`) or never answer (`hang`); default: it succeeds
 * @param {'refuse'} [options.login] makes every login fail with `401 Login failure` once the credentials are posted; default: it succeeds
 * @param {number} [options.loginDelayMs] holds every authenticate answer for this many milliseconds (default: no delay)
 * @param {number} [options.usersCap] stops the AM users endpoint (not IDM) at this many results, in the list and in the count
 * @param {string[]} [options.oauth2Clients] client ids the OAuth2 client list of the realm answers with (default: it answers 404)
 * @param {string[]} [options.scripts] script names the script list of the realm answers with (default: it answers 404)
 * @param {string[]} [options.secrets] ids the list of environment secrets answers with (a cloud tenant; default: it answers 404)
 * @param {string[]} [options.services] ids the list of AM services (realm and global) answers with (default: it answers 404)
 * @param {{ stores: { _id: string, type: string }[], mappings?: Record<string, { secretId: string, aliases?: string[] }[]> }} [options.secretStores] the secret stores of the realm and their mappings (default: they answer 404)
 * @param {string[]} [options.trees] journey names the journey list of the realm answers with; an empty array is a realm without journeys (default: it answers 404)
 * @param {object[]} [options.users] managed users the fake serves under /openidm/managed/ (`_id`, `userName`, `givenName`, `sn`, `mail`)
 * @param {string[]} [options.realms] realm names the realm list answers with (default: it answers 404)
 * @param {{method: string, path: string}[]} [options.failRequests] requests that answer with HTTP 500 (path is a URL fragment)
 * @param {object[]} [options.logApiKeys] keys returned by the log API key list
 * @returns {Promise<{ port: number, stop: () => void }>}
 */
export async function startFakeAm({
  recordPath,
  journey,
  realms,
  grantError,
  issuer,
  users,
  oauth2Clients,
  scripts,
  secrets,
  services,
  secretStores,
  trees,
  usersCap,
  sessionTtlSeconds,
  logout,
  login,
  loginDelayMs,
  failRequests,
  logApiKeys,
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-am-'));
  const written = (name, data) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(data));
    return file;
  };
  const child = cp.spawn(process.execPath, [fakeAmPath], {
    env: {
      ...process.env,
      ...(recordPath ? { FAKE_AM_RECORD: recordPath } : {}),
      ...(journey ? { FAKE_AM_JOURNEY: journey } : {}),
      ...(realms ? { FAKE_AM_REALMS: realms.join(',') } : {}),
      ...(grantError ? { FAKE_AM_GRANT_ERROR: grantError } : {}),
      ...(issuer
        ? { FAKE_AM_ISSUER_FILE: written('issuer.json', issuer) }
        : {}),
      ...(users ? { FAKE_AM_USERS_FILE: written('users.json', users) } : {}),
      ...(oauth2Clients
        ? { FAKE_AM_OAUTH2_CLIENTS: oauth2Clients.join(',') }
        : {}),
      ...(scripts ? { FAKE_AM_SCRIPTS: scripts.join(',') } : {}),
      ...(secrets ? { FAKE_AM_SECRETS: secrets.join(',') } : {}),
      ...(services ? { FAKE_AM_SERVICES: services.join(',') } : {}),
      ...(secretStores
        ? {
            FAKE_AM_SECRET_STORES_FILE: written(
              'secret-stores.json',
              secretStores
            ),
          }
        : {}),
      ...(trees ? { FAKE_AM_TREES: trees.join(',') } : {}),
      ...(usersCap ? { FAKE_AM_USERS_CAP: String(usersCap) } : {}),
      ...(sessionTtlSeconds
        ? { FAKE_AM_SESSION_TTL_SECONDS: String(sessionTtlSeconds) }
        : {}),
      ...(logout ? { FAKE_AM_LOGOUT: logout } : {}),
      ...(login ? { FAKE_AM_LOGIN: login } : {}),
      ...(loginDelayMs
        ? { FAKE_AM_LOGIN_DELAY_MS: String(loginDelayMs) }
        : {}),
      ...(failRequests
        ? { FAKE_AM_FAIL_REQUESTS: JSON.stringify(failRequests) }
        : {}),
      ...(logApiKeys
        ? { FAKE_AM_LOG_API_KEYS_FILE: written('log-keys.json', logApiKeys) }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const match = out.match(/PORT=(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      reject(new Error(`fake AM exited early with code ${code}`))
    );
  });
  return {
    port,
    stop: () => {
      child.kill('SIGTERM');
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
