/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    If your command completes without errors and with the expected results,
 *    all the required mocks already exist and you are good to write your
 *    test and skip to step #4.
 *
 *    If, however, your command fails and you see errors like the one below,
 *    you know you need to record the mock responses first:
 *
 *    [Polly] [adapter:node-http] Recording for the following request is not found and `recordIfMissing` is `false`.
 *
 * 2. Record mock responses for your exact command.
 *    In mock record mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=record frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    Wait until you see all the Polly instances (mock recording adapters) have
 *    shutdown before you try to run step #1 again.
 *    Messages like these indicate mock recording adapters shutting down:
 *
 *    Polly instance 'conn/4' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 2s...
 *    Polly instance 'conn/save/3' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 1s...
 *    Polly instance 'conn/save/3' stopping in 2s...
 *    Polly instance 'conn/4' stopped.
 *    Polly instance 'conn/save/3' stopping in 1s...
 *    Polly instance 'conn/save/3' stopped.
 *
 * 3. Validate your freshly recorded mock responses are complete and working.
 *    Re-run the exact command you want to test in mock mode (see step #1).
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Commit both your test and your new recordings to the repository.
 *    Your tests are likely going to reside outside the frodo-lib project but
 *    the recordings must be committed to the frodo-lib project.
 */

/*
User:
FRODO_MOCK=record frodo info https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com 'password'
FRODO_MOCK=record frodo info https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com 'password' --json
FRODO_MOCK=record frodo info https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com 'password' --scriptFriendly
FRODO_MOCK=record frodo info https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com 'password' -s

Service Account (param):
FRODO_MOCK=record frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id b672336b-41ef-428d-ae4a-e0c082875377 --sa-jwk-file ~/Downloads/frodo-test_privateKey.jwk
FRODO_MOCK=record frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id b672336b-41ef-428d-ae4a-e0c082875377 --sa-jwk-file ~/Downloads/frodo-test_privateKey.jwk --json
FRODO_MOCK=record frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id b672336b-41ef-428d-ae4a-e0c082875377 --sa-jwk-file ~/Downloads/frodo-test_privateKey.jwk --scriptFriendly
FRODO_MOCK=record frodo info https://openam-frodo-dev.forgeblocks.com/am --sa-id b672336b-41ef-428d-ae4a-e0c082875377 --sa-jwk-file ~/Downloads/frodo-test_privateKey.jwk -s

Service Account (env vars):
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo info
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo info --json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo info --scriptFriendly
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo info -s
 */
import cp from 'child_process';
import { promisify } from 'util';
import {getEnv, removeAnsiEscapeCodes} from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';
import { rmSync, writeFileSync } from 'fs';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const jwkFile = 'test/fs_tmp/info-jwk.json';

beforeAll(() => {
  writeFileSync(jwkFile, c.saJwk);
});

afterAll(() => {
  rmSync(jwkFile);
});

describe('frodo info', () => {
  describe('Authenticate as user', () => {
    test.skip(`frodo info <host> <user> <pass>`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass}`;
      const { stderr } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    });

    test.skip(`frodo info <host> <user> <pass> --json`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass} --json`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test.skip(`frodo info <host> <user> <pass> --scriptFriendly`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass} --scriptFriendly`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test.skip(`frodo info <host> <user> <pass> -s`, async () => {
      const CMD = `frodo info ${c.host} ${c.user} ${c.pass} -s`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  });

  describe('Authenticate as service account using cli args', () => {
    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file>`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile}`;
      const { stderr } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    });

    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file> --json`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile} --json`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file> --scriptFriendly`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile} --scriptFriendly`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`frodo info <host> --sa-id <sa-id> --sa-jwk-file <sa-jwk-file> -s`, async () => {
      const CMD = `frodo info ${c.host} --sa-id ${c.saId} --sa-jwk-file ${jwkFile} -s`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  });

  describe('Authenticate as service account using env vars', () => {
    test(`frodo info`, async () => {
      const CMD = `frodo info`;
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stderr } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    });

    test(`frodo info --json`, async () => {
      const CMD = `frodo info --json`;
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`frodo info --scriptFriendly`, async () => {
      const CMD = `frodo info --scriptFriendly`;
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`frodo info -s`, async () => {
      const CMD = `frodo info -s`;
      env.env.FRODO_HOST = c.host;
      env.env.FRODO_SA_ID = c.saId;
      env.env.FRODO_SA_JWK = c.saJwk;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  });
});
