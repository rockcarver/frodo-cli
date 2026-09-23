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
 *
 * 3. Validate your freshly recorded mock responses are complete and working.
 *    Re-run the exact command you want to test in mock mode (see step #1).
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Commit both your test and your new recordings to the repository.
 */

import { getEnv, testSuccess } from './utils/TestUtils';
import { iga_connection as ic } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const igaEnv = getEnv(ic);

// TODO(iga-ccb-ai-recording): every sub-test below needs a custom workflow
// imported (and several need it published) before the delete under test can
// run, and both of those preconditions are unreliable against ccb-ai --
// confirmed directly: importing testWorkflow2 succeeded per the CLI's own
// output, but the immediate `delete -di testWorkflow2` that followed still
// failed ("Failed to delete workflow testWorkflow2"). This stacks the same
// reliability issues already documented in
// iga-workflow-describe/import/publish.e2e.test.js's TODOs (unreliable
// post-import reads, and -- for the published-workflow sub-tests -- the
// fragile exact-body-match on the publish endpoint too). Revisit once a more
// stable IGA recording target is available (e.g. frodo-dev, once IGA is
// deployed there) rather than continuing to fight ccb-ai's indexing here.
describe('frodo iga workflow delete', () => {
  test.skip(`"frodo iga workflow delete -di <id>": should delete a draft workflow`, async () => {
    const CMD = `frodo iga workflow delete -di testWorkflow1`;
    await testSuccess(CMD, igaEnv);
  });

  test.skip(`"frodo iga workflow delete -Fpi <id>": should delete a published workflow`, async () => {
    const CMD = `frodo iga workflow delete -Fpi testWorkflow9`;
    await testSuccess(CMD, igaEnv);
  });

  test.skip(`"frodo iga workflow delete --workflow-id <id> --force": should delete both draft and published forms`, async () => {
    const CMD = `frodo iga workflow delete --workflow-id testWorkflow4 --force`;
    await testSuccess(CMD, igaEnv);
  });

  test.skip(`"frodo iga workflow delete --draft-only -a": should delete all draft workflows`, async () => {
    const CMD = `frodo iga workflow delete --draft-only -a`;
    await testSuccess(CMD, igaEnv);
  });

  test.skip(`"frodo iga workflow delete --published-only -Fa": should fail (protected OOTB workflows)`, async () => {
    const CMD = `frodo iga workflow delete --published-only -Fa`;
    await testSuccess(CMD, igaEnv);
  });

  test.skip(`"frodo iga workflow delete -Fdp --all": should fail (protected OOTB workflows)`, async () => {
    const CMD = `frodo iga workflow delete -Fdp --all`;
    await testSuccess(CMD, igaEnv);
  });
});
