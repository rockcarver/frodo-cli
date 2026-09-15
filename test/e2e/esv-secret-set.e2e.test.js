/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret set -Fi esv-test-secret-pi-generic --description "Test secret containing value of pi"
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret set --secret-id esv-test-secret-pi-generic --description "Test secret containing value of pi"
*/
import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo esv secret set', () => {
    test('"frodo esv secret set -Fi esv-test-secret-pi-generic --description "Test secret containing value of pi"": should update the "esv-test-secret-pi-generic" secret\'s description.', async () => {
        const CMD = `frodo esv secret set -Fi esv-test-secret-pi-generic --description "Test secret containing value of pi"`;
        await testSuccess(CMD, env);
    });

    test('"frodo esv secret set --secret-id esv-test-secret-pi-generic --description "Test secret containing value of pi"": should not update the "esv-test-secret-pi-generic" secret\'s description when no changes are made.', async () => {
        const CMD = `frodo esv secret set --secret-id esv-test-secret-pi-generic --description "Test secret containing value of pi"`;
        await testSuccess(CMD, env);
    });
});
