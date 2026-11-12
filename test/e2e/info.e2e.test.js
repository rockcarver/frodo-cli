/** See test/e2e/README.md for how to write and record e2e tests. */

/*
Credentials come from the environment (see test/e2e/utils/TestConfig.js):
FRODO_TEST_USER, FRODO_TEST_PASSWORD, FRODO_TEST_SA_ID and FRODO_TEST_SA_JWK
(the JWK itself, for example export FRODO_TEST_SA_JWK="$(cat key.jwk)").

User:
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am "$FRODO_TEST_USER" "$FRODO_TEST_PASSWORD"
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am "$FRODO_TEST_USER" "$FRODO_TEST_PASSWORD" --json
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am "$FRODO_TEST_USER" "$FRODO_TEST_PASSWORD" --scriptFriendly
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am "$FRODO_TEST_USER" "$FRODO_TEST_PASSWORD" -s

Service Account (param), with the key in a file (save $FRODO_TEST_SA_JWK to ~/sa-key.jwk):
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id "$FRODO_TEST_SA_ID" --sa-jwk-file ~/sa-key.jwk
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id "$FRODO_TEST_SA_ID" --sa-jwk-file ~/sa-key.jwk --json
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id "$FRODO_TEST_SA_ID" --sa-jwk-file ~/sa-key.jwk --scriptFriendly
FRODO_MOCK=record FRODO_NO_CACHE=1 frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id "$FRODO_TEST_SA_ID" --sa-jwk-file ~/sa-key.jwk -s

Service Account (env vars):
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID="$FRODO_TEST_SA_ID" FRODO_SA_JWK="$FRODO_TEST_SA_JWK" frodo info
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID="$FRODO_TEST_SA_ID" FRODO_SA_JWK="$FRODO_TEST_SA_JWK" frodo info --json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID="$FRODO_TEST_SA_ID" FRODO_SA_JWK="$FRODO_TEST_SA_JWK" frodo info --scriptFriendly
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID="$FRODO_TEST_SA_ID" FRODO_SA_JWK="$FRODO_TEST_SA_JWK" frodo info -s
 */
import { getEnv, normalizeSnapshotText, exec } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';
import { rmSync, writeFileSync } from 'fs';


process.env['FRODO_MOCK'] ||= '1';

const jwkFile = 'test/fs_tmp/info-jwk.json';

beforeAll(() => {
  writeFileSync(jwkFile, c.saJwk);
});

afterAll(() => {
  rmSync(jwkFile);
});

describe('frodo info', () => {
  describe('Authenticate as user', () => {
    test(`frodo info <host> <user> <pass>`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass}`;
      const env = getEnv({ ...c, saId: undefined, saJwk: undefined });
      const { stderr } = await exec(CMD, env);
      expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
    });

    test(`frodo info <host> <user> <pass> --json`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass} --json`;
      const env = getEnv({ ...c, saId: undefined, saJwk: undefined });
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`frodo info <host> <user> <pass> --scriptFriendly`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass} --scriptFriendly`;
      const env = getEnv({ ...c, saId: undefined, saJwk: undefined });
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`frodo info <host> <user> <pass> -s`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass} -s`;
      const env = getEnv({ ...c, saId: undefined, saJwk: undefined });
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  });

  describe('Authenticate as service account using cli args', () => {
    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file>`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile}`;
      const env = getEnv({ ...c, user: undefined, pass: undefined });
      const { stderr } = await exec(CMD, env);
      expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
    });

    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file> --json`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile} --json`;
      const env = getEnv({ ...c, user: undefined, pass: undefined });
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file> --scriptFriendly`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile} --scriptFriendly`;
      const env = getEnv({ ...c, user: undefined, pass: undefined });
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file> -s`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile} -s`;
      const env = getEnv({ ...c, user: undefined, pass: undefined });
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  });

  describe('Authenticate as service account using env vars', () => {
    test(`frodo info`, async () => {
      const CMD = `frodo info`;
      const env = getEnv({ ...c, user: undefined, pass: undefined, saId: undefined, saJwk: undefined });
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stderr } = await exec(CMD, env);
      expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
    });

    test(`frodo info --json`, async () => {
      const CMD = `frodo info --json`;
      const env = getEnv({ ...c, user: undefined, pass: undefined, saId: undefined, saJwk: undefined });
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`frodo info --scriptFriendly`, async () => {
      const CMD = `frodo info --scriptFriendly`;
      const env = getEnv({ ...c, user: undefined, pass: undefined, saId: undefined, saJwk: undefined });
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`frodo info -s`, async () => {
      const CMD = `frodo info -s`;
      const env = getEnv({ ...c, user: undefined, pass: undefined, saId: undefined, saJwk: undefined });
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  });
});
