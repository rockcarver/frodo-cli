/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy export -i 'Test Policy'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy export --policy-id 'Test Policy' -f my-Test-Policy.policy.authz.json --set-id test-policy-set --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy export -MNi 'Test Policy' -D authzPolicyExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy export --all --file my-allAlphaPolicies.policy.authz.json --set-id test-policy-set --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy export -MNaD authzPolicyExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy export --modified-properties --all-separate --no-metadata --directory authzPolicyExportTestDir3 --set-id test-policy-set --no-deps --prereqs
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'policy.authz';

describe('frodo authz policy export', () => {
    test('"frodo authz policy export -i \'Test Policy\'": should export the policy with id "Test Policy"', async () => {
        const exportFile = "Test-Policy.policy.authz.json";
        const CMD = `frodo authz policy export -i 'Test Policy'`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz policy export --policy-id \'Test Policy\' -f my-Test-Policy.policy.authz.json --set-id test-policy-set --no-deps --prereqs": should export the policy with id "Test Policy" from the test-policy-set into the file my-Test-Policy.policy.authz.json with no dependencies and with prereqs', async () => {
        const exportFile = "my-Test-Policy.policy.authz.json";
        const CMD = `frodo authz policy export --policy-id 'Test Policy' -f ${exportFile} --set-id test-policy-set --no-deps --prereqs`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz policy export -MNi \'Test Policy\' -D authzPolicyExportTestDir1": should export the policy with id "Test Policy" into the directory authzPolicyExportTestDir1', async () => {
        const exportDirectory = "authzPolicyExportTestDir1";
        const CMD = `frodo authz policy export -MNi 'Test Policy' -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo authz policy export -a": should export all policies to a single file', async () => {
        const exportFile = "allAlphaPolicies.policy.authz.json";
        const CMD = `frodo authz policy export -a`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz policy export --all --file my-allAlphaPolicies.policy.authz.json --set-id test-policy-set --no-deps --prereqs": should export all policies from the test-policy-set to a single file named my-allAlphaPolicies.policy.authz.json with no dependencies and with prereqs', async () => {
        const exportFile = "my-allAlphaPolicies.policy.authz.json";
        const CMD = `frodo authz policy export --all --file ${exportFile} --set-id test-policy-set --no-deps --prereqs`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz policy export -MNaD authzPolicyExportTestDir2": should export all policies to a single file in the directory authzPolicyExportTestDir2', async () => {
        const exportDirectory = "authzPolicyExportTestDir2";
        const CMD = `frodo authz policy export -MNaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo authz policy export -A": should export all policies to separate files', async () => {
        const CMD = `frodo authz policy export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo authz policy export --modified-properties --all-separate --no-metadata --directory authzPolicyExportTestDir3 --set-id test-policy-set --no-deps --prereqs": should export all policies from the test-policy-set to separate files in the directory authzPolicyExportTestDir3 with no dependencies and with prereqs', async () => {
        const exportDirectory = "authzPolicyExportTestDir3";
        const CMD = `frodo authz policy export --modified-properties --all-separate --no-metadata --directory ${exportDirectory} --set-id test-policy-set --no-deps --prereqs`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
