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
To update cloud exports, run these:
rm test/e2e/exports/all/all.cloud.json
rm -rf test/e2e/exports/all-separate/cloud
FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -NRdaD test/e2e/exports/all -f all.cloud.json --include-active-values
FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -NRdAD test/e2e/exports/all-separate/cloud --include-active-values

To update classic exports, ensure you have a local on-prem instance of AM with the host http://openam-frodo-dev.classic.com:8080/am, then run these:
rm test/e2e/exports/all/all.classic.json
rm -rf test/e2e/exports/all-separate/classic
FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config export -NRdaD test/e2e/exports/all -f all.classic.json
FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config export -NRdAD test/e2e/exports/all-separate/classic

To update idm exports, ensure you have a local on-prem instance of idm with the host https://nightly.gcp.forgeops.com/am, then run these:
rm test/e2e/exports/all/all.forgeops.json
rm -rf test/e2e/exports/all-separate/forgeops
FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config export -NRdaD test/e2e/exports/all -f all.forgeops.json
FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config export -NRdAD test/e2e/exports/all-separate/forgeops

To record, run these:

// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import -adf test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import --all --clean --re-uuid-scripts --re-uuid-journeys --file test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import --all-separate --clean --re-uuid-scripts --re-uuid-journeys --directory test/e2e/exports/all-separate/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import -AD test/e2e/exports/all-separate/cloud --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import -gf test/e2e/exports/all-separate/cloud/global/sync/sync.idm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import --file test/e2e/exports/all-separate/cloud/realm/root-alpha/script/mode.script.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import --all -f test/e2e/exports/all/all.empty.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import --all-separate -D nonexistant
// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import -adf test/e2e/exports/all/all.classic.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import --all --clean --re-uuid-scripts --re-uuid-journeys --file test/e2e/exports/all/all.classic.json --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import -AdD test/e2e/exports/all-separate/classic -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import --all-separate --clean --re-uuid-scripts --re-uuid-journeys --directory test/e2e/exports/all-separate/classic --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import -gf test/e2e/exports/all-separate/classic/global/server/01.server.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import --global --file test/e2e/exports/all-separate/classic/global/authenticationModules/authPushReg.authenticationModules.json --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import -f test/e2e/exports/all-separate/classic/realm/root/webhookService/Cool-Webhook.webhookService.json -m classic
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config import -af test/e2e/exports/all/all.forgeops.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am  frodo config import -aCf test/e2e/exports/all/all.forgeops.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config import -AD test/e2e/exports/all-separate/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am  frodo config import --default -CAD test/e2e/exports/all-separate/forgeops -m forgeops
*/
import {
  getEnv,
  testFail,
  testSuccess
} from './utils/TestUtils';
import { connection as c, classic_connection as cc, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const cloudEnv = getEnv(c);
const classicEnv = getEnv(cc);
const forgeopsEnv = getEnv(fc);

const allDirectory = 'test/e2e/exports/all';
const allCloudFileName = 'all.cloud.json';
const allClassicFileName = 'all.classic.json';
const allForgeopsFileName = 'all.forgeops.json';
const allCloudExport = `${allDirectory}/${allCloudFileName}`;
const allClassicExport = `${allDirectory}/${allClassicFileName}`;
const allForgeopsExport = `${allDirectory}/${allForgeopsFileName}`;
const allSeparateCloudDirectory = `test/e2e/exports/all-separate/cloud`;
const allSeparateClassicDirectory = `test/e2e/exports/all-separate/classic`;
const allSeparateForgeopsDirectory = `test/e2e/exports/all-separate/forgeops`;

describe('frodo config import', () => {

  describe('Cloud', () => {

    // TODO: Re-record test
    test.skip(`"frodo config import -adf ${allCloudExport}" Import everything from "${allCloudFileName}", including default scripts.`, async () => {
      const CMD = `frodo config import -adf ${allCloudExport}`;
      await testSuccess(CMD, cloudEnv);
    });

    // TODO: Fix test. Unable get test passing consistently, even after recording mocks (probably due to the re-uuid stuff). Skip for the meantime
    test.skip(`"frodo config import --all --clean --re-uuid-scripts --re-uuid-journeys --file ${allCloudExport}" Import everything from "${allCloudFileName}". Clean old services, and re-uuid journeys and scripts.`, async () => {
      const CMD = `frodo config import --all --clean --re-uuid-scripts --re-uuid-journeys --file ${allCloudExport}`;
      await testSuccess(CMD, cloudEnv);
    });

    // TODO: Fix test. Unable get test passing consistently, even after recording mocks (probably due to the re-uuid stuff). Skip for the meantime
    test.skip(`"frodo config import --all-separate --clean --re-uuid-scripts --re-uuid-journeys --directory ${allSeparateCloudDirectory}" Import everything from directory "${allSeparateCloudDirectory}". Clean old services, and re-uuid journeys and scripts.`, async () => {
      const CMD = `frodo config import --all-separate --clean --re-uuid-scripts --re-uuid-journeys --directory ${allSeparateCloudDirectory}`;
      await testSuccess(CMD, cloudEnv);
    });

    // TODO: Re-record test
    test.skip(`"frodo config import -AD ${allSeparateCloudDirectory} --include-active-values" Import everything with secret values from directory "${allSeparateCloudDirectory}"`, async () => {
      const CMD = `frodo config import -AD ${allSeparateCloudDirectory} --include-active-values`;
      await testFail(CMD, cloudEnv);
    });

    // TODO: Re-record test
    test.skip(`"frodo config import -gf ${allSeparateCloudDirectory}/global/sync/sync.idm.json" Import sync.idm.json along with extracted mappings and no errors`, async () => {
      const CMD = `frodo config import -gf ${allSeparateCloudDirectory}/global/sync/sync.idm.json`;
      await testSuccess(CMD, cloudEnv);
    });

    test(`"frodo config import --all -f ${allDirectory}/all.empty.json" Import nothing with empty JSON file`, async () => {
      const CMD = `frodo config import --all -f ${allDirectory}/all.empty.json`;
      await testSuccess(CMD, cloudEnv);
    });

    test(`"frodo config import --all-separate -D nonexistant" Import nothing with no existing directories`, async () => {
      const CMD = `frodo config import --all-separate -D nonexistant`;
      await testSuccess(CMD, cloudEnv);
    });
  });

  // Classic Env Tests
  describe('Classic', () => {
    // TODO: Re-record test
    test.skip(`"frodo config import -adf ${allClassicExport} -m classic" Import everything from "${allClassicFileName}", including default scripts.`, async () => {
      const CMD = `frodo config import -adf ${allClassicExport} -m classic`;
      await testFail(CMD, classicEnv);
    }, 300000);

    // TODO: Fix test. Unable get test passing consistently, even after recording mocks (probably due to the re-uuid stuff). Skip for the meantime
    test.skip(`"frodo config import --all --clean --re-uuid-scripts --re-uuid-journeys --file ${allClassicExport} --type classic" Import everything from "${allClassicFileName}". Clean old services, and re-uuid journeys and scripts.`, async () => {
      const CMD = `frodo config import --all --clean --re-uuid-scripts --re-uuid-journeys --file ${allClassicExport}--type classic`;
      await testSuccess(CMD, classicEnv);
    });

    // TODO: Re-record test
    test.skip(`"frodo config import -AdD ${allSeparateClassicDirectory} -m classic" Import everything from directory "${allSeparateClassicDirectory}"`, async () => {
      const CMD = `frodo config import -AdD ${allSeparateClassicDirectory} -m classic`;
      await testFail(CMD, classicEnv);
    }, 300000);

    // TODO: Fix test. Unable get test passing consistently, even after recording mocks (probably due to the re-uuid stuff). Skip for the meantime
    test.skip(`"frodo config import --all-separate --clean --re-uuid-scripts --re-uuid-journeys --directory ${allSeparateClassicDirectory} --type classic" Import everything from directory "${allSeparateClassicDirectory}". Clean old services, and re-uuid journeys and scripts.`, async () => {
      const CMD = `frodo config import --all-separate --clean --re-uuid-scripts --re-uuid-journeys --directory ${allSeparateClassicDirectory} --type classic`;
      await testSuccess(CMD, classicEnv);
    });

    test(`"frodo config import -gf ${allSeparateClassicDirectory}/global/server/01.server.json -m classic" Import server 01 along with extracted properties and no errors`, async () => {
      const CMD = `frodo config import -gf ${allSeparateClassicDirectory}/global/server/01.server.json -m classic`;
      await testSuccess(CMD, classicEnv);
    });

    test(`"frodo config import --global --file ${allSeparateClassicDirectory}/global/authenticationModules/authPushReg.authenticationModules.json --type classic" Fail to import authentication module due to it being read only.`, async () => {
      const CMD = `frodo config import --global --file ${allSeparateClassicDirectory}/global/authenticationModules/authPushReg.authenticationModules.json --type classic`;
      await testFail(CMD, classicEnv);
    });

    test(`"frodo config import -f ${allSeparateClassicDirectory}/realm/root/webhookService/Cool-Webhook.webhookService.json -m classic" Import the webhook service with no errors`, async () => {
      const CMD = `frodo config import -f ${allSeparateClassicDirectory}/realm/root/webhookService/Cool-Webhook.webhookService.json -m classic`;
      await testSuccess(CMD, classicEnv);
    });
  });

  // Forgeops Tests
  describe('Forgeops', () => {
    // TODO: Re-record. This import relies on missing Polly recordings whose
    // "recording not found" errors were previously baked into the snapshot.
    // The replay-integrity guard in the test runners now fails on those, so
    // this test must be re-recorded before it can be re-enabled.
    test.skip(`"frodo config import -af ${allForgeopsExport} -m forgeops" Import everything from "${allForgeopsFileName}".`, async () => {
      const CMD = `frodo config import -af ${allForgeopsExport} -m forgeops`;
      await testFail(CMD, forgeopsEnv);
    });

    // The tests with -C, --clean result in polly recording errors in the snapshots. This is because certain service configuration is not deletable.
    // TODO: For some reason Polly is unable to record these delete requests. If it's possible to fix this issue, then update this test to pass.
    test.skip(`"frodo config import -aCf ${allForgeopsExport} -m forgeops" Import everything from "${allForgeopsFileName}". Clean old services`, async () => {
      const CMD = `frodo config import -aCf ${allForgeopsExport} -m forgeops`;
      await testFail(CMD, forgeopsEnv);
    });

    test(`"frodo config import -AD ${allSeparateForgeopsDirectory} -m forgeops" Import everything from directory "${allSeparateForgeopsDirectory}".`, async () => {
      const CMD = `frodo config import -AD ${allSeparateForgeopsDirectory} -m forgeops`;
      await testFail(CMD, forgeopsEnv);
    });

    // The tests with -C, --clean result in polly recording errors in the snapshots. This is because certain service configuration is not deletable.
    // TODO: For some reason Polly is unable to record these delete requests. If it's possible to fix this issue, then update this test to pass.
    test.skip(`"frodo config import --default -CAD ${allSeparateForgeopsDirectory} -m forgeops" Import everything from directory "${allSeparateForgeopsDirectory}", including default scripts. Clean old services`, async () => {
      const CMD = `frodo config import --default -CAD ${allSeparateForgeopsDirectory} -m forgeops`;
      await testFail(CMD, forgeopsEnv);
    });
  });
});
