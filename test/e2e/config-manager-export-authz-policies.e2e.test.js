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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull authz-policies -D configManagerExportAuthzPoliciesDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull authz-policies -D configManagerExportAuthzPoliciesDir3 -r alpha
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull authz-policies -D configManagerExportAuthzPoliciesDir5 -n murphyTestPolicySet -r bravo
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull authz-policies --directory configManagerExportAuthzPoliciesDir4 -r bravo
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull authz-policies -D configManagerExportAuthzPoliciesDir6 -f test/e2e/fr-config-manager-pull-config/authz-policies.json
*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pulls', () => {
 test('"frodo config-manager pull authz-policies -D configManagerExportAuthzPoliciesDir2": should export policies, policy-sets, and resource-types from all realms in fr-config manager style.', async () => {
         const dirName = 'configManagerExportAuthzPoliciesDir2';
         const CMD = `frodo config-manager pull authz-policies -D ${dirName}`;
         await testExport(CMD, env, undefined, undefined, dirName, false);
     });
     test('"frodo config-manager pull authz-policies -D configManagerExportAuthzPoliciesDir3 -r alpha": should export policies, policy-sets, and resource-types from the alpha realm in fr-config manager style.', async () => {    
         const dirName = 'configManagerExportAuthzPoliciesDir3';
         const realm = 'alpha';
         const CMD = `frodo config-manager pull authz-policies -D ${dirName} -r ${realm}`;
         await testExport(CMD, env, undefined, undefined, dirName, false);
     });
     test('"frodo config-manager pull authz-policies --directory configManagerExportAuthzPoliciesDir4 -r bravo": should export policies, policy-sets, and resource-types from the bravo realm in fr-config manager style.', async () => {
         const dirName = 'configManagerExportAuthzPoliciesDir4';
         const realm = 'bravo';
         const CMD = `frodo config-manager pull authz-policies --directory ${dirName} -r ${realm}`;
         await testExport(CMD, env, undefined, undefined, dirName, false);
     });
     test('"frodo config-manager pull authz-policies -D configManagerExportAuthzPoliciesDir5 -n murphyTestPolicySet -r bravo": should export only the policy set with the id: "murphyTestPolicySet".', async () => {
         const dirName = 'configManagerExportAuthzPoliciesDir5';
         const policySetName = 'murphyTestPolicySet';
         const realm = 'bravo';
         const CMD = `frodo config-manager pull authz-policies -D ${dirName} -n ${policySetName} -r ${realm}`;
         await testExport(CMD, env, undefined, undefined, dirName, false);
     });
     test('"frodo config-manager pull authz-policies -D configManagerExportAuthzPoliciesDir6-f test/e2e/fr-config-manager-pull-config/authz-policies.json" : should export only the policy set with the id: "murphyTestPolicySet".', async () => {
        const dirName = 'configManagerExportAuthzPoliciesDir6'
        const CMD = `frodo config-manager pull authz-policies -D ${dirName} -f test/e2e/fr-config-manager-pull-config/authz-policies.json`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
});