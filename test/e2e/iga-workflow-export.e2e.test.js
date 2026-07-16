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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow export -Ni testWorkflow1 -D testWorkflowExportDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow export --workflow-id testWorkflow1 --no-coords --no-deps -xf testWorkflowExportFile1.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow export --no-metadata -a --directory testWorkflowExportDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow export --all -R --no-coords --no-deps --use-string-arrays --file testWorkflowExportFile2.json 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow export -NAD testWorkflowExportDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow export --all-separate --use-string-arrays --read-only --no-coords --no-deps --no-extract -D testWorkflowExportDir4
 */
import { getEnv, testExport } from './utils/TestUtils';
import { iga_connection as ic } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const igaEnv = getEnv(ic);

const type = 'workflow';

describe(`frodo iga workflow export`, () => {
  test(`"frodo iga workflow export -Ni testWorkflow1": should export workflow 'testWorkflow1' with extracted scripts and no metadata`, async () => {
    const exportDirectory = "testWorkflowExportDir1";
    const CMD = `frodo iga workflow export -Ni testWorkflow1 -D ${exportDirectory}`;
    await testExport(CMD, igaEnv, type, undefined, exportDirectory, false, true);
  });

  test(`"frodo iga workflow export --workflow-id testWorkflow1 --no-coords --no-deps -xf testWorkflowExportFile1.json": should export workflow 'testWorkflow1' with no coordinates and no dependencies`, async () => {
    const exportFile = 'testWorkflowExportFile1.json';
    const CMD = `frodo iga workflow export --workflow-id testWorkflow1 --no-coords --no-deps -xf ${exportFile}`;
    await testExport(CMD, igaEnv, type, exportFile, undefined, true, true);
  });

  test(`"frodo iga workflow export --no-metadata -a --directory testWorkflowExportDir2": should export all workflows with no metadata`, async () => {
    const exportFile = 'allWorkflows.workflow.json';
    const exportDirectory = "testWorkflowExportDir2";
    const CMD = `frodo iga workflow export --no-metadata -a --directory ${exportDirectory}`;
    await testExport(CMD, igaEnv, type, exportFile, exportDirectory, false, true);
  });

  test(`"frodo iga workflow export --all -R --no-coords --no-deps --use-string-arrays --file testWorkflowExportFile2.json": should export all workflows including non-mutable ones with no coordinates and no dependencies`, async () => {
    const exportFile = 'testWorkflowExportFile2.json';
    const CMD = `frodo iga workflow export --all -R --no-coords --no-deps --use-string-arrays --file ${exportFile}`;
    await testExport(CMD, igaEnv, type, exportFile, undefined, true, true);
  });

  test(`"frodo iga workflow export -NAD testWorkflowExportDir3": should export all workflows separately with no metadata`, async () => {
    const exportDirectory = "testWorkflowExportDir3";
    const CMD = `frodo iga workflow export -NAD ${exportDirectory}`;
    await testExport(CMD, igaEnv, type, undefined, exportDirectory, false, true);
  });

  test(`"frodo iga workflow export --all-separate --use-string-arrays --read-only --no-coords --no-deps --no-extract -D testWorkflowExportDir4": should export all workflows separately including non-mutable ones with no coordinates, no dependencies, and using string arrays`, async () => {
    const exportDirectory = "testWorkflowExportDir4";
    const CMD = `frodo iga workflow export --all-separate --use-string-arrays --read-only --no-coords --no-deps --no-extract -D ${exportDirectory}`;
    await testExport(CMD, igaEnv, type, undefined, exportDirectory, true, true);
  });
});
