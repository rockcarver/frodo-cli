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

process.env['FRODO_MOCK'] = '1';
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
