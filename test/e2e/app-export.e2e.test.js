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
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export -i test2
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export --app-id test2
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export -i test2 -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export -i test2 --no-deps
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export -a
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export --all
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export -a --file test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export -a --no-deps
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export -A
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export --all-separate
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo app export -A --no-deps
*/

/*
FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export -i HRLite
FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export --app-id EncoreAD
FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export -i HRLite -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export -i HRLite --no-deps -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export -a
FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export --all -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export -a --file test.json
FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export -a --no-deps -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export -A
// FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export --all-separate
// FRODO_MOCK=record FRODO_HOST=https://openam-volker-demo.forgeblocks.com/am frodo app export -A --no-deps
*/
import { testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = {
  env: process.env,
};
env.env.FRODO_HOST = 'https://openam-volker-demo.forgeblocks.com/am'; //c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

const type = 'application';

describe('frodo app export', () => {
  test('"frodo app export -i HRLite": should export the app with app id "HRLite"', async () => {
    const exportFile = 'HRLite.application.json';
    const CMD = `frodo app export -i HRLite`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo app export --app-id EncoreAD": should export the app with app id "EncoreAD"', async () => {
    const exportFile = 'EncoreAD.application.json';
    const CMD = `frodo app export --app-id EncoreAD`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo app export -i HRLite -f my-HRLite.application.json": should export the app with app id "HRLite" into file named my-HRLite.application.json', async () => {
    const exportFile = 'my-HRLite.application.json';
    const CMD = `frodo app export -i HRLite -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo app export -i HRLite --no-deps -f my-nodeps-HRLite.application.json": should export the app with app id "HRLite" with no dependencies into a file named my-nodeps-HRLite.application.json', async () => {
    const exportFile = 'my-nodeps-HRLite.application.json';
    const CMD = `frodo app export -i HRLite --no-deps -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo app export -a": should export all apps to a single file', async () => {
    const exportFile = 'allAlphaApplications.application.json';
    const CMD = `frodo app export -a`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo app export --all -f my-allAlphaApplications.application.json": should export all apps to a single file named my-allAlphaApplications.application.json', async () => {
    const exportFile = 'my-allAlphaApplications.application.json';
    const CMD = `frodo app export --all -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo app export -a --file my-other-allAlphaApplications.application.json": should export all apps to a single file named my-other-allAlphaApplications.application.json', async () => {
    const exportFile = 'my-other-allAlphaApplications.application.json';
    const CMD = `frodo app export -a --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo app export -a --no-deps -f my-yet-another-allAlphaApplications.application.json": should export all apps to a single file with no dependencies into a file named my-yet-another-allAlphaApplications.application.json', async () => {
    const exportFile = 'my-yet-another-allAlphaApplications.application.json';
    const CMD = `frodo app export -a --no-deps -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo app export -A": should export all apps to separate files', async () => {
    const CMD = `frodo app export -A`;
    await testExport(CMD, env, type);
  });

//   test('"frodo app export --all-separate": should export all apps to separate files', async () => {
//     const CMD = `frodo app export --all-separate`;
//     await testExport(CMD, env, type);
//   });

//   test('"frodo app export -A --no-deps": should export all apps to separate files with no dependencies', async () => {
//     const CMD = `frodo app export -A --no-deps`;
//     await testExport(CMD, env, type);
//   });
});
