/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -i esv-test-secret -f test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import --secret-id esv-test-secret --file test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -i esv-test-secret -f allSecrets.secret.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -i esv-test-secret -f test/e2e/exports/all/allSecrets.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -f test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -f allSecrets.secret.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -a --file test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -a -f allSecrets.secret.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -a -f test/e2e/exports/all/allSecrets.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -AD test/e2e/exports/all-separate/cloud/global/secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -AD test/e2e/exports/all-separate/cloud/global/secret --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -f esv-test-secret.secret.json --directory test/e2e/exports/all-separate/cloud/global/secret
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = 'test/e2e/exports/all';
const allSecretsFileName = 'allSecrets.secret.json';
const allSecretsExport = `${allDirectory}/${allSecretsFileName}`;
const allSeparateSecretsDirectory = `test/e2e/exports/all-separate/cloud/global/secret`;

describe('frodo esv secret import', () => {
    test(`"frodo esv secret import -i esv-test-secret -f ${allSecretsExport}" Import secret "esv-test-secret" from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -i esv-test-secret -f ${allSecretsExport}`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  
    test(`"frodo esv secret import --secret-id esv-test-secret --file ${allSecretsExport}" Import secret "esv-test-secret" from "${allSecretsFileName}".`, async () => {
      const CMD = `frodo esv secret import --secret-id esv-test-secret --file ${allSecretsExport}`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  
    test(`"frodo esv secret import -i esv-test-secret -f ${allSecretsFileName} -D ${allDirectory}" Import secret "esv-test-secret" from "${allSecretsFileName}" in directory "${allDirectory}".`, async () => {
      const CMD = `frodo esv secret import -i esv-test-secret -f ${allSecretsFileName} -D ${allDirectory}`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv secret import -i esv-test-secret -f ${allSecretsExport} --include-active-values" Import secret "esv-test-secret" and secret value from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -i esv-test-secret -f ${allSecretsExport} --include-active-values`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  
    test(`"frodo esv secret import -f ${allSecretsExport}" Import first secret from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -f ${allSecretsExport}`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  
    test(`"frodo esv secret import -f ${allSecretsFileName} -D ${allDirectory}" Import first secret from "${allSecretsFileName}" in directory "${allDirectory}"`, async () => {
      const CMD = `frodo esv secret import -f ${allSecretsFileName} -D ${allDirectory}`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  
    test(`"frodo esv secret import -a --file ${allSecretsExport}" Import all secrets from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -a --file ${allSecretsExport}`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  
    test(`"frodo esv secret import -a -f ${allSecretsFileName} -D ${allDirectory}" Import all secrets from "${allSecretsFileName}" in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import -a -f ${allSecretsFileName} -D ${allDirectory}`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  
    test(`"frodo esv secret import -a -f ${allSecretsExport} --include-active-values" Import all secrets and secret values from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -a -f ${allSecretsExport} --include-active-values`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  
    test(`"frodo esv secret import -AD ${allSeparateSecretsDirectory}" Import all secrets in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import -AD ${allSeparateSecretsDirectory}`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  
    test(`"frodo esv secret import -AD ${allSeparateSecretsDirectory} --include-active-values" Import all secrets and secret values in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import -AD ${allSeparateSecretsDirectory} --include-active-values`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
  
    test(`"frodo esv secret import -f esv-test-secret.secret.json --directory ${allSeparateSecretsDirectory}" Import first secret from "esv-test-secret.secret.json" in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import -f esv-test-secret.secret.json --directory ${allSeparateSecretsDirectory}`;
      const { stdout } = await exec(CMD, env);
      expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
