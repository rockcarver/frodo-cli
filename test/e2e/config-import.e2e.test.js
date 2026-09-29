/** See test/e2e/README.md for how to write and record e2e tests. */

/*
To update cloud exports, run these:
rm test/e2e/exports/all/all.cloud.json
rm -rf test/e2e/exports/all-separate/cloud
FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -NRdaD test/e2e/exports/all -f all.cloud.json
FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -NRdAD test/e2e/exports/all-separate/cloud
// Note: --include-active-values is intentionally omitted -- it would write real, live
// secret/credential values from the tenant into these committed fixture files.

To update the dedicated full-tenant re-import fixtures used by the "Cloud" describe
block's "-adf"/"-AD" tests below, run these instead. These are deliberately SEPARATE
files from all.cloud.json/all-separate/cloud above -- those two are shared fixture
input for ~30 other *-import.e2e.test.js files, and regenerating them from a live
tenant snapshot changes their content in ways that break those other tests' recorded
snapshots. The full-tenant re-import tests need a full, current snapshot of the tenant
(so that re-importing it is close to a no-op), so they get their own copy instead:
rm test/e2e/exports/all/all.cloud-full-import.json
rm -rf test/e2e/exports/all-separate/cloud-full-import
FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -NRdaD test/e2e/exports/all -f all.cloud-full-import.json
FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config export -NRdAD test/e2e/exports/all-separate/cloud-full-import

To update classic exports, ensure you have a local on-prem instance of AM with the host http://openam-frodo-dev.classic.com:8080/am, then run these:
rm test/e2e/exports/all/all.classic.json
rm -rf test/e2e/exports/all-separate/classic
FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config export -NRdaD test/e2e/exports/all -f all.classic.json
FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config export -NRdAD test/e2e/exports/all-separate/classic

To update idm exports, ensure you have a local on-prem instance of idm with the host https://nightly.gcp.forgeops.com/am, then run these:
rm test/e2e/exports/all/forgeops/all.forgeops.json
rm -rf test/e2e/exports/all-separate/forgeops
FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config export -NRdaD test/e2e/exports/all/forgeops -f all.forgeops.json
FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config export -NRdAD test/e2e/exports/all-separate/forgeops

To record, run these:

// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import -adf test/e2e/exports/all/all.cloud-full-import.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import --all --clean --re-uuid-scripts --re-uuid-journeys --file test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import --all-separate --clean --re-uuid-scripts --re-uuid-journeys --directory test/e2e/exports/all-separate/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import -AD test/e2e/exports/all-separate/cloud-full-import
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import -gf test/e2e/exports/all-separate/cloud/global/sync/sync.idm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import --file test/e2e/exports/all-separate/cloud/realm/root-alpha/script/mode.script.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import --all -f test/e2e/exports/all/all.empty.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import --all-separate -D nonexistant
// Cloud IGA
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import -caf test/e2e/exports/all/all.iga.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config import -AD test/e2e/exports/all-separate/iga
// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import -adf test/e2e/exports/all/all.classic.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import --all --clean --re-uuid-scripts --re-uuid-journeys --file test/e2e/exports/all/all.classic.json --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import -AdD test/e2e/exports/all-separate/classic -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import --all-separate --clean --re-uuid-scripts --re-uuid-journeys --directory test/e2e/exports/all-separate/classic --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import -gf test/e2e/exports/all-separate/classic/global/server/01.server.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import --global --file test/e2e/exports/all-separate/classic/global/authenticationModules/authPushReg.authenticationModules.json --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo config import -f test/e2e/exports/all-separate/classic/realm/root/webhookService/Cool-Webhook.webhookService.json -m classic
*/
import {
  getEnv,
  testFail,
  testSuccess
} from './utils/TestUtils';
import { connection as c, iga_connection as ic, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);
const igaEnv = getEnv(ic);
const classicEnv = getEnv(cc);

const allDirectory = 'test/e2e/exports/all';
const allCloudFileName = 'all.cloud.json';
const allClassicFileName = 'all.classic.json';
const allCloudExport = `${allDirectory}/${allCloudFileName}`;
const allClassicExport = `${allDirectory}/${allClassicFileName}`;
const allSeparateCloudDirectory = `test/e2e/exports/all-separate/cloud`;
const allSeparateClassicDirectory = `test/e2e/exports/all-separate/classic`;

// Dedicated fixtures for the full-tenant re-import tests below -- kept separate
// from all.cloud.json/all-separate/cloud above, which ~30 other *-import.e2e.test.js
// files use as shared fixture input.
const allCloudFullImportFileName = 'all.cloud-full-import.json';
const allCloudFullImportExport = `${allDirectory}/${allCloudFullImportFileName}`;
const allSeparateCloudFullImportDirectory = `test/e2e/exports/all-separate/cloud-full-import`;

describe('frodo config import', () => {

  describe('Cloud', () => {

    // Full-tenant re-import: exports the tenant's own current config and
    // imports it right back into the same tenant. Even reimporting a
    // tenant's own data onto itself isn't fully clean -- a bounded set of
    // "already exists" conflicts (resource types, OAuth2 applications,
    // circles of trust, SAML entities) and stale frodo-lib built-in
    // default templates (SocialIdentityProviders sub-configs, the email
    // service, pushed by -a regardless of what's in the export) fail
    // validation against current Identity Cloud, so the command exits
    // non-zero overall.
    test(`"frodo config import -adf ${allCloudFullImportExport}" Import everything from "${allCloudFullImportFileName}", including default scripts.`, async () => {
      const CMD = `frodo config import -adf ${allCloudFullImportExport}`;
      await testFail(CMD, cloudEnv);
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

    // Same full-tenant re-import as above, via the --all-separate directory
    // form instead of a single file. --include-active-values is
    // intentionally not used here -- it would write real secret values
    // into the recorded cassette.
    test(`"frodo config import -AD ${allSeparateCloudFullImportDirectory}" Import everything from directory "${allSeparateCloudFullImportDirectory}"`, async () => {
      const CMD = `frodo config import -AD ${allSeparateCloudFullImportDirectory}`;
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

  // Cloud IGA Tests
  describe('IGA', () => {
    // TODO: Record tests (unable to get these passing after recording due to missing recordings, seems like polly is failing to save certain requests)
    test.skip(`"frodo config import -caf test/e2e/exports/all/all.iga.json": Should import all IGA configuration from single file, with only custom request types imported`, async () => {
      const CMD = `frodo config import -caf test/e2e/exports/all/all.iga.json`;
      await testSuccess(CMD, igaEnv);
    });
    // TODO: Record tests (unable to get these passing after recording due to missing recordings, seems like polly is failing to save certain requests)
    test.skip(`"frodo config import -AD test/e2e/exports/all-separate/iga": Should import all IGA configuration from separate files`, async () => {
      const CMD = `frodo config import -AD test/e2e/exports/all-separate/iga`;
      await testSuccess(CMD, igaEnv);
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
});
