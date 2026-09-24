/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set export -i test-policy-set
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set export --set-id test-policy-set -f my-test-policy-set.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set export -MNi test-policy-set -D authzPolicySetExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set export --all --file my-allAlphaPolicySets.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set export -MNaD authzPolicySetExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set export --modified-properties --all-separate --no-metadata --directory authzPolicySetExportTestDir3 --no-deps --prereqs
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'policyset.authz';

describe('frodo authz set export', () => {
    test('"frodo authz set export -i test-policy-set": should export the policy set with id "test-policy-set"', async () => {
        const exportFile = "test-policy-set.policyset.authz.json";
        const CMD = `frodo authz set export -i test-policy-set`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz set export --set-id test-policy-set -f my-test-policy-set.policyset.authz.json --no-deps --prereqs": should export the policy set with id "test-policy-set" from the test-policy-set into the file .my-test-policy-set.policyset.authz.json with no dependencies and with prereqs', async () => {
        const exportFile = "my-test-policy-set.policyset.authz.json";
        const CMD = `frodo authz set export --set-id test-policy-set -f ${exportFile} --no-deps --prereqs`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz set export -MNi test-policy-set -D authzPolicySetExportTestDir1": should export the policy set with id "test-policy-set" into the directory authzPolicySetExportTestDir1', async () => {
        const exportDirectory = "authzPolicySetExportTestDir1";
        const CMD = `frodo authz set export -MNi test-policy-set -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo authz set export -a": should export all policy sets to a single file', async () => {
        const exportFile = "allAlphaPolicySets.policyset.authz.json";
        const CMD = `frodo authz set export -a`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz set export --all --file my-allAlphaPolicySets.policyset.authz.json --no-deps --prereqs": should export all policy sets from the test-policy-set to a single file named my-allAlphaPolicySets.policyset.authz.json with no dependencies and with prereqs', async () => {
        const exportFile = "my-allAlphaPolicySets.policyset.authz.json";
        const CMD = `frodo authz set export --all --file ${exportFile} --no-deps --prereqs`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo authz set export -MNaD authzPolicySetExportTestDir2": should export all policy sets to a single file in the directory authzPolicySetExportTestDir2', async () => {
        const exportDirectory = "authzPolicySetExportTestDir2";
        const CMD = `frodo authz set export -MNaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo authz set export -A": should export all policy sets to separate files', async () => {
        const CMD = `frodo authz set export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo authz set export --modified-properties --all-separate --no-metadata --directory authzPolicySetExportTestDir3 --no-deps --prereqs": should export all policy sets from the test-policy-set to separate files in the directory authzPolicySetExportTestDir3 with no dependencies and with prereqs', async () => {
        const exportDirectory = "authzPolicySetExportTestDir3";
        const CMD = `frodo authz set export --modified-properties --all-separate --no-metadata --directory ${exportDirectory} --no-deps --prereqs`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
