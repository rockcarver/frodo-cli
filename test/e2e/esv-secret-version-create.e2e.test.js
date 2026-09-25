/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret version create -i esv-test-secret-pi-generic --value "3.1"
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret version create -i esv-test-secret-cert-pem-raw --file test/e2e/test-data/esv/key-pair.pem
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret version create --file test/e2e/test-data/esv/hmac-key.txt -i esv-test-secret-file-base64hmac-raw
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo esv secret version create', () => {
  test('"frodo esv secret version create -i esv-test-secret-pi-generic --value "3.1"": should create a new version of the "esv-test-var-pi-generic" secret', async () => {
    const CMD = `frodo esv secret version create -i esv-test-secret-pi-generic --value "3.1"`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });
  test('"frodo esv secret version create -i esv-test-secret-cert-pem-raw --file test/e2e/test-data/esv/key-pair.pem": should create a new version of the "esv-test-secret-cert-pem-raw" secret', async () => {
    const CMD = `frodo esv secret version create -i esv-test-secret-cert-pem-raw --file test/e2e/test-data/esv/key-pair.pem`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });
  test('"frodo esv secret version create --file test/e2e/test-data/esv/hmac-key.txt -i esv-test-secret-file-base64hmac-raw": should create a new version of the "esv-test-secret-file-base64hmac-raw" secret', async () => {
    const CMD = `frodo esv secret version create --file test/e2e/test-data/esv/hmac-key.txt -i esv-test-secret-file-base64hmac-raw`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });
});
