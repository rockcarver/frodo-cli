/**
 * Master-key usability gate for the suites that read or write encrypted
 * connection profiles.
 *
 * A key is "usable" when it actually decrypts the committed fixture
 * test/e2e/env/Connections.json -- existence alone is not enough: a stale,
 * rotated, or auto-generated key at that path produces raw node-crypto
 * failures mid-suite ("Unsupported state or unable to authenticate data"),
 * the Oct 2026 CI signature. Call this once at module scope and gate the
 * key-dependent tests with testif():
 *
 *   const hasUsableMasterKey = checkMasterKeyUsable();
 *   testif(hasUsableMasterKey)('...', async () => { ... });
 *
 * The check mirrors frodo-lib's DataProtection exactly: FRODO_MASTER_KEY
 * (inline) wins over FRODO_MASTER_KEY_PATH (file), the raw key material is
 * fed to scrypt, the fixture value is salt(64) | nonce(16) | tag(16) |
 * ciphertext, AES-256-GCM. It only ever READS: it never generates, writes,
 * or modifies a key, so running the gated suites can no longer poison the
 * fixture path for concurrently-running suites.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DEFAULT_PROFILES_PATH = path.resolve('./test/e2e/env/Connections.json');

/**
 * Trial-decrypt the fixture's first encrypted value with the key material
 * the suites would use (inline FRODO_MASTER_KEY, else the file at
 * FRODO_MASTER_KEY_PATH). Returns true only when decryption succeeds.
 * @param profilesPath optional connections fixture to verify against
 */
export function checkMasterKeyUsable(profilesPath = DEFAULT_PROFILES_PATH) {
  const inlineKey = process.env['FRODO_MASTER_KEY']?.trim();
  const keyPath = process.env['FRODO_MASTER_KEY_PATH'];

  let masterKey;
  if (inlineKey) {
    masterKey = inlineKey;
  } else if (keyPath && fs.existsSync(keyPath)) {
    // Read raw: frodo-lib feeds the file's raw bytes to scrypt, so any
    // trailing newline is part of the key and must be part of the check.
    masterKey = fs.readFileSync(keyPath, 'utf8');
  } else {
    console.warn(
      'Master-key gate: no master key available (FRODO_MASTER_KEY unset, ' +
        `${keyPath ?? 'no FRODO_MASTER_KEY_PATH'} missing) -- skipping the ` +
        'key-dependent tests. On CI this is expected for fork and Dependabot ' +
        'PRs, which get no Actions secrets.'
    );
    return false;
  }

  try {
    const fixture = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
    const firstEncrypted = Object.values(fixture)
      .map(
        (profile) => profile.encodedAmsterPrivateKey || profile.encodedSvcacctJwk
      )
      .find(Boolean);
    if (!firstEncrypted) {
      console.warn(
        `Master-key gate: ${profilesPath} carries no encrypted values to ` +
          'verify against -- skipping the key-dependent tests.'
      );
      return false;
    }
    const buffer = Buffer.from(firstEncrypted, 'base64');
    const salt = buffer.subarray(0, 64);
    const nonce = buffer.subarray(64, 80);
    const tag = buffer.subarray(80, 96);
    const encrypted = buffer.subarray(96);
    const key = crypto.scryptSync(masterKey, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    decipher.update(encrypted.toString('binary'), 'binary', 'utf8');
    decipher.final('utf8');
    return true;
  } catch (error) {
    console.warn(
      `Master-key gate: the available master key cannot decrypt the ` +
        `committed fixture ${profilesPath} (${error.message}) -- skipping ` +
        'the key-dependent tests. A stale or rotated key produces this ' +
        'exactly; rotate the fixture (re-encrypt Connections.json) or set ' +
        'FRODO_MASTER_KEY to the matching key.'
    );
    return false;
  }
}
