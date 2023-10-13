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
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script export --script-name 'GitHub Profile Normalization'
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script export -n 'GitHub Profile Normalization' -f my-GitHub-Profile-Normalization.script.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script export -n 'GitHub Profile Normalization' -D scriptExportTestDir1
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script export --all
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script export -a --file my-allAlphaScripts.script.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script export -aD scriptExportTestDir2
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script export -A
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script export -AxD scriptExportTestDir3
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script export --all-separate --extract --directory scriptExportTestDir4
*/
import { testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = {
  env: process.env,
};
env.env.FRODO_HOST = c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

const type = 'script';

describe('frodo script export', () => {
  test('"frodo script export --script-name \'GitHub Profile Normalization\'": should export the script named "GitHub Profile Normalization"', async () => {
    const exportFile = 'GitHub-Profile-Normalization.script.json';
    const CMD = `frodo script export --script-name 'GitHub Profile Normalization'`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo script export -n \'GitHub Profile Normalization\' -f my-GitHub-Profile-Normalization.script.json": should export the script named "GitHub Profile Normalization" into file named my-GitHub-Profile-Normalization.script.json', async () => {
    const exportFile = 'my-GitHub-Profile-Normalization.script.json';
    const CMD = `frodo script export -n 'GitHub Profile Normalization' -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo script export -n \'GitHub Profile Normalization\' -D scriptExportTestDir1": should export the script named "GitHub Profile Normalization" into the directory scriptExportTestDir1', async () => {
    const exportDirectory = 'scriptExportTestDir1';
    const CMD = `frodo script export -n 'GitHub Profile Normalization' -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });

  test('"frodo script export --all": should export all scripts to a single file', async () => {
    const exportFile = 'allAlphaScripts.script.json';
    const CMD = `frodo script export --all`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo script export -a --file my-allAlphaScripts.script.json": should export all scripts to a single file named my-allAlphaScripts.script.json', async () => {
    const exportFile = 'my-allAlphaScripts.script.json';
    const CMD = `frodo script export -a --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo script export -aD scriptExportTestDir2": should export all scripts to a single file in the directory scriptExportTestDir2', async () => {
    const exportDirectory = 'scriptExportTestDir2';
    const CMD = `frodo script export -aD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });

  test('"frodo script export -A": should export all scripts to separate files', async () => {
    const CMD = `frodo script export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo script export -AxD scriptExportTestDir3": should export all extracted scripts to separate files in the directory scriptExportTestDir3', async () => {
    const exportDirectory = 'scriptExportTestDir3';
    const CMD = `frodo script export -AxD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });

  test('"frodo script export --all-separate --extract --directory scriptExportTestDir4": should export all extracted scripts to separate files in the directory scriptExportTestDir4', async () => {
    const exportDirectory = 'scriptExportTestDir4';
    const CMD = `frodo script export --all-separate --extract --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });
});
