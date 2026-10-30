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
 * @param {number} [options.usersCap] stops the AM users endpoint (not IDM) at this many results, in the list and in the count
 * @param {object[]} [options.users] managed users the fake serves under /openidm/managed/ (`_id`, `userName`, `givenName`, `sn`, `mail`)
 * @param {string[]} [options.realms] realm names the realm list answers with (default: it answers 404)
 * @returns {Promise<{ port: number, stop: () => void }>}
 */
export async function startFakeAm({
  recordPath,
  journey,
  realms,
  grantError,
  issuer,
  users,
  usersCap,
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
      ...(usersCap ? { FAKE_AM_USERS_CAP: String(usersCap) } : {}),
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
