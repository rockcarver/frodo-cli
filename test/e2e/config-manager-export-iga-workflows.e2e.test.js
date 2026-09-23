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

FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-ccb-ai.forgeblocks.com/am npm run test:update -- config-manager-export-iga-workflows

test_workflow_4 is not an out-of-the-box workflow, so it must exist before
recording. The beforeAll below stages it automatically during a recording
run; this is only for reference / manual mock-mode probing (step #1 above):
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-ccb-ai.forgeblocks.com/am frodo iga workflow import --workflow-id test_workflow_4 --file test/e2e/exports/all/allWorkflows.workflow.json --no-deps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-ccb-ai.forgeblocks.com/am frodo iga workflow delete --workflow-id test_workflow_4 --force
*/

import { getEnv, testExport, testFail } from './utils/TestUtils';
import { iga_connection as ic } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(ic);

describe('frodo config-manager pull ', () => {
  test('"frodo config-manager pull iga-workflows -D igaTestDir01": should export the iga workflows in fr-config-manager style"', async () => {
      const dirName = 'igaTestDir01';
      const CMD = `frodo config-manager pull iga-workflows -D ${dirName}`;
      await testExport(CMD, env, undefined, undefined, dirName, false, true);
    });

  // TODO(iga-ccb-ai-recording): test_workflow_4 is a custom workflow that
  // must be imported before this can run, and freshly-imported custom
  // workflows are not reliably readable against ccb-ai (see
  // iga-workflow-describe.e2e.test.js's TODO for the full investigation).
  // Revisit once a more stable IGA recording target is available.
  test.skip('"frodo config-manager pull iga-workflows -n test_workflow_4  -D igaTestDir02": should export a single iga workflow by name: test_workflow_4 in fr-config-manager style"', async () => {
      const dirName = 'igaTestDir02';
      const CMD = `frodo config-manager pull iga-workflows -n test_workflow_4 -D ${dirName}`;
      await testExport(CMD, env, undefined, undefined, dirName, false, true);
  });
  test('"frodo config-manager pull iga-workflows -i -D igaTestDir03": should export all worfklows including immutable ones in fr-config-manager style"', async () => {
      const dirName = 'igaTestDir03';
      const CMD = `frodo config-manager pull iga-workflows -i -D ${dirName}`;
      await testExport(CMD, env, undefined, undefined, dirName, false, true);
  });
  test('"frodo config-manager pull iga-workflows -i -n BasicApplicationGrant -D igaTestDir04": should export a non-mutable workflow when -i is set"', async () => {
      const dirName = 'igaTestDir04';
      const CMD = `frodo config-manager pull iga-workflows -i -n BasicApplicationGrant -D ${dirName}`;
      await testExport(CMD, env, undefined, undefined, dirName, false, true);
  });
  test('"frodo config-manager pull iga-workflows --name BasicApplicationGrant -D igaTestDir05": should fail because the non-mutable workflow is not found without -i"', async () => {
      const dirName = 'igaTestDir05';
      const CMD = `frodo config-manager pull iga-workflows --name BasicApplicationGrant -D ${dirName}`;
      await testFail(CMD, env, undefined, undefined, dirName, false, true);
  });
});
