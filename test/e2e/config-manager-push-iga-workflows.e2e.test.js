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
frodo-dev has no IGA components deployed, so these are recorded against
ccb-ai instead (FRODO_HOST override below) -- iga_connection in TestConfig.js
stays pointed at frodo-dev on purpose; replay matching ignores hostname and
credentials entirely, so a recording made against a different tenant replays
fine through a test that nominally targets frodo-dev.

FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-ccb-ai.forgeblocks.com/am FRODO_MOCK_HOSTS=https://openam-ccb-ai.forgeblocks.com frodo config-manager push iga-workflows --draft -D test/e2e/exports/fr-config-manager/cloud

The source directory (test/e2e/exports/fr-config-manager/cloud/iga/workflows)
defines test-BasicApplicationGrant and test-BasicEntitlementRemove -- both
custom, tenant-created workflows (distinct ids from the out-of-the-box
BasicApplicationGrant).
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { iga_connection as ic } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const igaEnv = getEnv(ic);

const allDirectory = "test/e2e/exports/fr-config-manager/cloud";

// TODO(iga-ccb-ai-recording): both sub-tests below push a workflow WITHOUT
// --draft, which (config-manager push iga-workflows' underlying
// configManagerImportIgaWorkflows -> frodo-lib's updateWorkflow) routes
// through _publishWorkflow, i.e. the same POST
// /iga/governance/workflow?_action=publish endpoint already flagged as
// replay-fragile elsewhere (see iga-workflow-import/publish.e2e.test.js's
// TODOs). Here it's worse than replay-fragility: recording it LIVE against
// ccb-ai fails outright and reproducibly -- confirmed on two separate
// attempts -- with an opaque `_PollyError: [Polly] Request failed due to an
// unknown error` wrapping the POST for the test-BasicApplicationGrant
// workflow (a large, many-step provisioning workflow), before any HTTP
// status is even captured. The --draft sub-test below (which uses the much
// simpler PUT-based putWorkflow path instead) records and replays fine, so
// this looks specific to the publish endpoint under a large payload against
// ccb-ai, not a general connectivity issue. Revisit once a more stable IGA
// recording target is available.
describe('frodo config-manager push iga-workflows', () => {
    test.skip(`"frodo config-manager push iga-workflows -D ${allDirectory} ": should import the iga workflows into cloud tenant"`, async () => {
        const CMD = `frodo config-manager push iga-workflows -D ${allDirectory} `;
        await testSuccess(CMD, igaEnv);
    });
    test(`"frodo config-manager push iga-workflows --draft -D ${allDirectory} ": should import the iga workflows into cloud tenant as draft workflows"`, async () => {
        const CMD = `frodo config-manager push iga-workflows --draft -D ${allDirectory} `;
        await testSuccess(CMD, igaEnv);
    });
    test.skip(`"frodo config-manager push iga-workflows -n test-BasicApplicationGrant -D ${allDirectory} ": should import a specific iga workflows by name into cloud tenant"`, async () => {
        const CMD = `frodo config-manager push iga-workflows -n test-BasicApplicationGrant -D ${allDirectory} `;
        await testSuccess(CMD, igaEnv);
    });
});
