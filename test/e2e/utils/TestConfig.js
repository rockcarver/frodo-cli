/**
 * The fixed test identities of the e2e suites (see test/e2e/README.md).
 *
 * Replay (FRODO_MOCK=1) never logs in for real, and no recording matches on the
 * key, so the service account JWK and the Amster private key are throwaway RSA
 * pairs made when a test process starts. They must be well formed, because the
 * CLI signs a token with them before the recording answers. They are never
 * written into the repository, and no real key belongs in this file: the check
 * is test/unit/NoCredentialsInTests.test.js.
 *
 * A recording pass that has to log in with credentials of its own (the `info`
 * and `log-list` tests; every other test records with your saved connection
 * profile) takes them from the environment of your shell instead:
 *
 *   FRODO_TEST_USER        admin user of the cloud tenant
 *   FRODO_TEST_PASSWORD    password of that user
 *   FRODO_TEST_SA_ID       service account id
 *   FRODO_TEST_SA_JWK      service account private key, the JWK itself
 *                          (export FRODO_TEST_SA_JWK="$(cat key.jwk)")
 *
 * They apply to `connection` and `iga_connection`. The user, the password, the
 * service account id and the hosts are identifiers that the recordings and
 * snapshots (and `conn-save`, in its test titles) were made with: leave them as
 * they are for replay.
 */
import { generateKeyPairSync } from 'crypto';

const saJwk =
  process.env.FRODO_TEST_SA_JWK ||
  JSON.stringify(
    generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      format: 'jwk',
    })
  );

export const connection = {
  type: 'cloud',
  host: 'https://openam-frodo-dev.forgeblocks.com/am',
  user: 'volker.scheuber@forgerock.com',
  pass: 'Sup3rS3cr3t!',
  isIGA: 'false',
  isPingFed: 'false',
  realm: 'alpha',
  saId: 'b672336b-41ef-428d-ae4a-e0c082875377',
  saJwk,
};

export const iga_connection = {
  type: 'cloud',
  host: 'https://openam-frodo-dev.forgeblocks.com/am',
  user: 'volker.scheuber@forgerock.com',
  pass: 'Sup3rS3cr3t!',
  isIGA: 'true',
  realm: 'alpha',
  saId: 'b672336b-41ef-428d-ae4a-e0c082875377',
  saJwk,
};

// Real values for a recording pass, from the environment of your shell.
const overrides = {
  user: process.env.FRODO_TEST_USER,
  pass: process.env.FRODO_TEST_PASSWORD,
  saId: process.env.FRODO_TEST_SA_ID,
};
for (const cloud of [connection, iga_connection]) {
  for (const [field, value] of Object.entries(overrides)) {
    if (value) cloud[field] = value;
  }
}

export const classic_connection = {
  type: 'classic',
  host: 'http://openam-frodo-dev.classic.com:8080/am',
  user: 'amAdmin',
  pass: 'Sup3rS3cr3t!',
  realm: '/',
}

export const forgeops_connection = {
  type: 'forgeops',
  host: 'https://nightly.gcp.forgeops.com/am',
  user: 'amAdmin',
  pass: 'Sup3rS3cr3t!',
  realm: '/',
}

export const amster_connection = {
  type: 'classic',
  host: 'http://openam-frodo-dev.amster.com:8080/am',
  user: 'amAdmin',
  realm: '/',
  pk: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }),
  authService: 'MockAmsterService'
}
