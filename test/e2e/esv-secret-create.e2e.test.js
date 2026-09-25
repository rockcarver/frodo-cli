/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret create -i esv-test-secret-pi-generic --value "3.141592653589793238462643383279502884" --description "This is a test secret containing the value pi."
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret create --secret-id esv-test-secret-pi-generic2 --value "3.141592653589793238462643383279502884" --description "This is a test secret containing the value pi." --encoding generic --no-use-in-placeholders
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret create -i esv-test-secret-value-pem --value "LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNQnNDQVFBQ0FVMENBUWNDQVNzQ0FRY0NBUXNDQVFFQ0FRTUNBUUk9Ci0tLS0tRU5EIFJTQSBQUklWQVRFIEtFWS0tLS0t" --encoding pem --description "This is a test secret from pem encoded string."
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret create -i esv-test-secret-cert-pem --file test/e2e/test-data/esv/key-pair-base64.pem --description "This is a test secret from a pem encoded cert file." --encoding pem
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret create -i esv-test-secret-cert-pem-raw --file test/e2e/test-data/esv/key-pair.pem --encoding pem --description "This is a test secret from a pem encoded cert file (raw)."
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret create -i esv-test-secret-value-base64hmac --value "d2t0UU05Snp2a1Bsb2JmYVdlaUlkODFXcWllR1JpZWY4ekl4R0pud1laZz0=" --description "This is a test secret from base64 encoded hmac key." --encoding base64hmac
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret create -i esv-test-secret-file-base64hmac --file test/e2e/test-data/esv/hmac-key-base64.txt --description "This is a test secret from base64 encoded hmac key file." --encoding base64hmac
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret create -i esv-test-secret-file-base64hmac-raw --file test/e2e/test-data/esv/hmac-key.txt --encoding base64hmac --description "This is a test secret from base64 encoded hmac key file (raw)."
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret create -i esv-test-secret-pi-unknown --value "3.141592653589793238462643383279502884" --description "This is a test secret containing the value pi." --encoding unknown
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo esv secret create', () => {
  test('"frodo esv secret create -i esv-test-secret-pi-generic --value "3.141592653589793238462643383279502884" --description "This is a test secret containing the value pi."": should create an esv secret with the value of pi generically encoded.', async () => {
    const CMD = `frodo esv secret create -i esv-test-secret-pi-generic --value "3.141592653589793238462643383279502884" --description "This is a test secret containing the value pi."`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo esv secret create --secret-id esv-test-secret-pi-generic2 --value "3.141592653589793238462643383279502884" --description "This is a test secret containing the value pi." --encoding generic --no-use-in-placeholders": should create an esv secret with the value of pi base64hmac encoded that cannot be used in placeholders', async () => {
    const CMD = `frodo esv secret create --secret-id esv-test-secret-pi-generic2 --value "3.141592653589793238462643383279502884" --description "This is a test secret containing the value pi." --encoding generic --no-use-in-placeholders`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo esv secret create -i esv-test-secret-value-pem --value "LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNQnNDQVFBQ0FVMENBUWNDQVNzQ0FRY0NBUXNDQVFFQ0FRTUNBUUk9Ci0tLS0tRU5EIFJTQSBQUklWQVRFIEtFWS0tLS0t" --encoding pem --description "This is a test secret from pem encoded string."": should create an esv secret with pem encoded string', async () => {
    const CMD = `frodo esv secret create -i esv-test-secret-value-pem --value "LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNQnNDQVFBQ0FVMENBUWNDQVNzQ0FRY0NBUXNDQVFFQ0FRTUNBUUk9Ci0tLS0tRU5EIFJTQSBQUklWQVRFIEtFWS0tLS0t" --encoding pem --description "This is a test secret from pem encoded string."`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo esv secret create -i esv-test-secret-cert-pem --file test/e2e/test-data/esv/key-pair-base64.pem --description "This is a test secret from a pem encoded cert file." --encoding pem": should create an esv secret with a pem encoded cert file', async () => {
    const CMD = `frodo esv secret create -i esv-test-secret-cert-pem --file test/e2e/test-data/esv/key-pair-base64.pem --description "This is a test secret from a pem encoded cert file." --encoding pem`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo esv secret create -i esv-test-secret-cert-pem-raw --file test/e2e/test-data/esv/key-pair.pem --encoding pem --description "This is a test secret from a pem encoded cert file (raw)."": should create an esv secret with a pem encoded cert file', async () => {
    const CMD = `frodo esv secret create -i esv-test-secret-cert-pem-raw --file test/e2e/test-data/esv/key-pair.pem --encoding pem --description "This is a test secret from a pem encoded cert file (raw)."`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo esv secret create -i esv-test-secret-value-base64hmac --value "d2t0UU05Snp2a1Bsb2JmYVdlaUlkODFXcWllR1JpZWY4ekl4R0pud1laZz0=" --description "This is a test secret from base64 encoded hmac key." --encoding base64hmac": should create an esv secret with hmac key string', async () => {
    const CMD = `frodo esv secret create -i esv-test-secret-value-base64hmac --value "d2t0UU05Snp2a1Bsb2JmYVdlaUlkODFXcWllR1JpZWY4ekl4R0pud1laZz0=" --description "This is a test secret from base64 encoded hmac key." --encoding base64hmac`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo esv secret create -i esv-test-secret-file-base64hmac --file test/e2e/test-data/esv/hmac-key-base64.txt --description "This is a test secret from base64 encoded hmac key file." --encoding base64hmac": should create an esv secret with base64hmac encoded file', async () => {
    const CMD = `frodo esv secret create -i esv-test-secret-file-base64hmac --file test/e2e/test-data/esv/hmac-key-base64.txt --description "This is a test secret from base64 encoded hmac key file." --encoding base64hmac`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo esv secret create -i esv-test-secret-file-base64hmac-raw --file test/e2e/test-data/esv/hmac-key.txt --encoding base64hmac --description "This is a test secret from base64 encoded hmac key file (raw)."": should create an esv secret with base64hmac encoded file', async () => {
    const CMD = `frodo esv secret create -i esv-test-secret-file-base64hmac-raw --file test/e2e/test-data/esv/hmac-key.txt --encoding base64hmac --description "This is a test secret from base64 encoded hmac key file (raw)."`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test('"frodo esv secret create -i esv-test-secret-pi-unknown --value "3.141592653589793238462643383279502884" --description "This is a test secret containing the value pi." --encoding unknown": should display an error when creating an esv secret with unknown encoding', async () => {
    const CMD = `frodo esv secret create -i esv-test-secret-pi-unknown --value "3.141592653589793238462643383279502884" --description "This is a test secret containing the value pi." --encoding unknown`;
    try {
      await exec(CMD, env);
      fail("Command should've failed")
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
});
});
