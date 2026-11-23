import cp from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * A self-signed certificate for 127.0.0.1, made with the openssl command into
 * `dir`. Nothing is committed: the key is made when a test starts and goes
 * away with its directory (test/unit/NoCredentialsInTests.test.js).
 *
 * @param {string} dir an existing directory the files are written to
 * @returns {{ key: Buffer, cert: Buffer } | undefined} the key and the
 *   certificate, or undefined without the openssl command
 */
export function selfSignedCertificate(dir) {
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  const made = cp.spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
    ],
    { encoding: 'utf8' }
  );
  if (made.status !== 0) return undefined;
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}
