import cp from 'child_process';
import { fileURLToPath } from 'url';

const fakeAmPath = fileURLToPath(new URL('./FakeAm.mjs', import.meta.url));

/**
 * Starts test/utils/FakeAm.mjs as a SEPARATE process (a terminal driver that
 * blocks this process's event loop could not be answered by an in-process
 * server) and resolves once it is listening.
 *
 * @param {object} [options]
 * @param {string} [options.recordPath] file the fake appends one JSON line per request to
 * @param {string} [options.journey] `password` for a plain login that succeeds (default: the MFA journey)
 * @param {string[]} [options.realms] realm names the realm list answers with (default: it answers 404)
 * @returns {Promise<{ port: number, stop: () => void }>}
 */
export async function startFakeAm({ recordPath, journey, realms } = {}) {
  const child = cp.spawn(process.execPath, [fakeAmPath], {
    env: {
      ...process.env,
      ...(recordPath ? { FAKE_AM_RECORD: recordPath } : {}),
      ...(journey ? { FAKE_AM_JOURNEY: journey } : {}),
      ...(realms ? { FAKE_AM_REALMS: realms.join(',') } : {}),
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
  return { port, stop: () => child.kill('SIGTERM') };
}
