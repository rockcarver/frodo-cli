/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create -i esv-test-var-bool --value "True" --variable-type bool --description "Test boolean variable"
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create --variable-id esv-test-var-pi-string --value "3.1415926" --variable-type string --description "This is another test variable."
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create -i esv-test-var-pi --value "3.1415926" --description "This is another test variable." --variable-type number
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create --variable-id esv-test-var-pi-unknown --value "3.1415926" --description "This is another test variable." --variable-type unknown
 */
import { getEnv, testSuccess, testFail } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo esv variable create', () => {
  test('"frodo esv variable create -i esv-test-var-bool --value "True" --variable-type bool --description "Test boolean variable"": should create an esv variable of type bool with value of true', async () => {
    const CMD = `frodo esv variable create -i esv-test-var-bool --value "True" --variable-type bool --description "Test boolean variable"`;
    await testSuccess(CMD, env);
  });

  test('"frodo esv variable create --variable-id esv-test-var-pi-string --value "3.1415926" --variable-type string --description "This is another test variable."": should create an esv variable of type string with the value of pi', async () => {
    const CMD = `frodo esv variable create --variable-id esv-test-var-pi-string --value "3.1415926" --variable-type string --description "This is another test variable."`;
    await testSuccess(CMD, env);
  });

  test('"frodo esv variable create -i esv-test-var-pi --value "3.1415926" --description "This is another test variable." --variable-type number": should fail to create an esv variable if it already exists', async () => {
    const CMD = `frodo esv variable create -i esv-test-var-pi --value "3.1415926" --description "This is another test variable." --variable-type number`;
    await testFail(CMD, env);
  });

  test('"frodo esv variable create --variable-id esv-test-var-pi-unknown --value "3.1415926" --description "This is another test variable." --variable-type unknown": should display an error when trying to create an esv variable of unknown type', async () => {
    const CMD = `frodo esv variable create --variable-id esv-test-var-pi-unknown --value "3.1415926" --description "This is another test variable." --variable-type unknown`;
    await testFail(CMD, env);
  });
});
