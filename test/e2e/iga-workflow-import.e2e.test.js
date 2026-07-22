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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow import -i testWorkflow1 -f test/e2e/exports/all/allWorkflows.workflow.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow import --workflow-id testWorkflow1 --file test/e2e/exports/all/allWorkflows.workflow.json --no-deps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow import -f test/e2e/exports/all/allWorkflows.workflow.json --no-deps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow import -af test/e2e/exports/all/allWorkflows.workflow.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow import --all --file test/e2e/exports/all/allWorkflows.workflow.json --no-deps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow import -AD test/e2e/exports/all-separate/iga/global/workflow
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow import --all-separate --directory test/e2e/exports/all-separate/iga/global/workflow --no-deps
 */
import { getEnv, testSuccess } from './utils/TestUtils';
import { iga_connection as ic } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const igaEnv = getEnv(ic);

const allDirectory = "test/e2e/exports/all";
const allWorkflowsFileName = "allWorkflows.workflow.json";
const allWorkflowsExport = `${allDirectory}/${allWorkflowsFileName}`;
const allSeparateWorkflowsDirectory = `test/e2e/exports/all-separate/iga/global/workflow`;

describe(`frodo iga workflow import`, () => {
  // TODO: Record tests (unable to get these passing after recording due to missing recordings, seems like polly is failing to save certain requests when handling dependencies)
  test.skip(`"frodo iga workflow import -i testWorkflow1 -f ${allWorkflowsExport}": should import testWorkflow1 from the file "${allWorkflowsExport}" with dependencies`, async () => {
    const CMD = `frodo iga workflow import -i testWorkflow1 -f ${allWorkflowsExport}`;
    await testSuccess(CMD, igaEnv);
  });

  test(`"frodo iga workflow import --workflow-id testWorkflow1 --file ${allWorkflowsExport} --no-deps": should import testWorkflow1 from the file "${allWorkflowsExport}"`, async () => {
    const CMD = `frodo iga workflow import --workflow-id testWorkflow1 --file ${allWorkflowsExport} --no-deps`;
    await testSuccess(CMD, igaEnv);
  });

  test(`"frodo iga workflow import -f ${allWorkflowsExport} --no-deps": should import first workflow from the file "${allWorkflowsExport}"`, async () => {
    const CMD = `frodo iga workflow import -f ${allWorkflowsExport} --no-deps`;
    await testSuccess(CMD, igaEnv);
  });

  // TODO: Record tests (unable to get these passing after recording due to missing recordings, seems like polly is failing to save certain requests when handling dependencies)
  test.skip(`"frodo iga workflow import -af ${allWorkflowsExport}": should import all workflows from the file "${allWorkflowsExport}" with dependencies`, async () => {
    const CMD = `frodo iga workflow import -af ${allWorkflowsExport}`;
    await testSuccess(CMD, igaEnv);
  });

  test(`"frodo iga workflow import --all --file ${allWorkflowsExport} --no-deps": should import all workflows from the file "${allWorkflowsExport}"`, async () => {
    const CMD = `frodo iga workflow import --all --file ${allWorkflowsExport} --no-deps`;
    await testSuccess(CMD, igaEnv);
  });

  test(`"frodo iga workflow import -AD ${allSeparateWorkflowsDirectory}": should import all workflows from the directory "${allSeparateWorkflowsDirectory}" with dependencies`, async () => {
    const CMD = `frodo iga workflow import -AD ${allSeparateWorkflowsDirectory}`;
    await testSuccess(CMD, igaEnv);
  });

  test(`"frodo iga workflow import --all-separate --directory ${allSeparateWorkflowsDirectory} --no-deps": should import all workflows from the directory "${allSeparateWorkflowsDirectory}"`, async () => {
    const CMD = `frodo iga workflow import --all-separate --directory ${allSeparateWorkflowsDirectory} --no-deps`;
    await testSuccess(CMD, igaEnv);
  });
});
