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
 *    $ FRODO_MOCK=record FRODO_MASTER_KEY=<master key> frodo conn save https://nightly.gcp.forgeops.com/am amadmin <password>
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
import cp from 'child_process';
import { promisify } from 'util';
import {getEnv, removeAnsiEscapeCodes, testif} from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';
import { writeFileSync, rmSync } from 'fs';

const exec = promisify(cp.exec);

const connectionsSaveFile = './test/e2e/env/ConnectionsSave.json';

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/ConnectionsSave.json';
const env = getEnv();

const jwkFile = 'test/fs_tmp/conn-save-jwk.json';

beforeAll(() => {
  writeFileSync(jwkFile, c.saJwk);
  writeFileSync(connectionsSaveFile, '{}');
});

afterAll(() => {
  rmSync(jwkFile);
  rmSync(connectionsSaveFile);
});

describe('frodo conn save', () => {
  testif(process.env['FRODO_MASTER_KEY'])(
    `"frodo conn save --no-validate ${c.host} ${c.user} ${c.pass}": save new connection profile using an admin account.`,
    async () => {
      const CMD = `frodo conn save --no-validate ${c.host} ${c.user} ${c.pass}`;
      const { stderr } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    }
  );

  testif(process.env['FRODO_MASTER_KEY'])(
    `"frodo conn save --no-validate --sa-id ${c.saId} --sa-jwk-file ${jwkFile} ${c.host}": save new connection profile with existing service account and without admin account.`,
    async () => {
      const CMD = `frodo conn save --no-validate --sa-id ${c.saId} --sa-jwk-file ${jwkFile} ${c.host}`;
      const { stderr } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    }
  );

  testif(process.env['FRODO_MASTER_KEY'])(
    `"frodo conn save --no-validate ${cc.host} ${cc.user} ${cc.pass}": save new classic connection profile using an admin account.`,
    async () => {
      const CMD = `frodo conn save --no-validate ${cc.host} ${cc.user} ${cc.pass}`;
      const { stderr } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    }
  );

  testif(process.env['FRODO_MASTER_KEY'])(
    `"frodo conn save --no-validate --private-key ${cc.pk} --authentication-service ${cc.authService} ${cc.host}": save new classic connection profile with private key and custom authentication service.`,
    async () => {
      const CMD = `frodo conn save --no-validate --private-key ${cc.pk} --authentication-service ${cc.authService} ${cc.host}`;
      const { stderr } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
    }
  );
});
