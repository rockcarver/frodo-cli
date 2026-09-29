/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable set -Fi esv-test-var-pi-string --value "3.14"
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable set -i esv-test-var-pi-string --value "3.14"
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable set -Fi esv-test-var-pi-string --description "This is a pi test variable."
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable set -i esv-test-var-pi-string --description "This is a pi test variable."
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable set --force-update --variable-id esv-test-var-pi-string --description "This is a test variable of pi." --value "3.14"
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable set --variable-id esv-test-var-pi-string --description "This is a test variable of pi." --value "3.14"
*/
import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo esv variable set', () => {
    test('"frodo esv variable set -Fi esv-test-var-pi-string --value "3.14"": should update the "esv-test-var-pi-string" variable\'s description.', async () => {
        const CMD = `frodo esv variable set -Fi esv-test-var-pi-string --value "3.14"`;
        await testSuccess(CMD, env);
    });

    test('"frodo esv variable set -i esv-test-var-pi-string --value "3.14"": should not update the "esv-test-var-pi-string" variable\'s description when no changes are made', async () => {
        const CMD = `frodo esv variable set -i esv-test-var-pi-string --value "3.14"`;
        await testSuccess(CMD, env);
    });

    test('"frodo esv variable set -Fi esv-test-var-pi-string --description "This is a pi test variable."": should update the "esv-test-var-pi-string" variable\'s description.', async () => {
        const CMD = `frodo esv variable set -Fi esv-test-var-pi-string --description "This is a pi test variable."`;
        await testSuccess(CMD, env);
    });

    test('"frodo esv variable set -i esv-test-var-pi-string --description "This is a pi test variable."": should not update the "esv-test-var-pi-string" variable\'s description when no changes are made', async () => {
        const CMD = `frodo esv variable set -i esv-test-var-pi-string --description "This is a pi test variable."`;
        await testSuccess(CMD, env);
    });

    test('"frodo esv variable set --force-update --variable-id esv-test-var-pi-string --description "This is a test variable of pi." --value "3.14"": should update the "esv-test-var-pi-string" variable', async () => {
        const CMD = `frodo esv variable set --force-update --variable-id esv-test-var-pi-string --description "This is a test variable of pi." --value "3.14"`;
        await testSuccess(CMD, env);
    });

    test('"frodo esv variable set --variable-id esv-test-var-pi-string --description "This is a test variable of pi." --value "3.14"": should not update the "esv-test-var-pi-string" variable when no changes made', async () => {
        const CMD = `frodo esv variable set --variable-id esv-test-var-pi-string --description "This is a test variable of pi." --value "3.14"`;
        await testSuccess(CMD, env);
    });
});
