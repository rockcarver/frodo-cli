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
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export -i 0f357b7e-6c54-4351-A094-43916877d7e5
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export --app-id 2e4663b7-aed2-4521-8819-d379449d91b0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export -n Azure
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export --app-name TestLDAP
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export -n Azure -f my-Azure.application.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export -n Azure --no-deps -f my-nodeps-Azure.application.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export -Nn Azure -D appExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export --all -f my-allAlphaApplications.application.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export -a --file my-other-allAlphaApplications.application.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export -a --no-deps -f my-yet-another-allAlphaApplications.application.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export -NaD appExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo app export --all-separate --no-metadata --no-deps --directory appExportTestDir3
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='rootNoPrefix' frodo app export -f forgeopsRootNoPrefixApps.application.json -am forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='rootPrefix' frodo app export --file forgeopsRootPrefixApps.application.json --all --use-realm-prefix-on-managed-objects --type forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='alphaNoPrefix' FRODO_REALM=alpha frodo app export -f forgeopsAlphaNoPrefixApps.application.json -am forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='alphaPrefix' FRODO_REALM=alpha frodo app export --file forgeopsAlphaPrefixApps.application.json --all --use-realm-prefix-on-managed-objects --type forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='alphaBravoNoPrefix' FRODO_REALM=alpha/bravo frodo app export -f forgeopsAlphaBravoNoPrefixApps.application.json -am forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME='alphaBravoPrefix' FRODO_REALM=alpha/bravo frodo app export --file forgeopsAlphaBravoPrefixApps.application.json --all --use-realm-prefix-on-managed-objects --type forgeops
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

const type = 'application';

describe('frodo app export', () => {
  describe('Cloud', () => {
    test('"frodo app export -i 0f357b7e-6c54-4351-A094-43916877d7e5": should export the app with app id "0f357b7e-6c54-4351-A094-43916877d7e5"', async () => {
      const exportFile = '0f357b7e-6c54-4351-A094-43916877d7e5.application.json';
      const CMD = `frodo app export -i 0f357b7e-6c54-4351-A094-43916877d7e5`;
      await testExport(CMD, env, type, exportFile);
    });

    test('"frodo app export --app-id 2e4663b7-aed2-4521-8819-d379449d91b0": should export the app with app id "2e4663b7-aed2-4521-8819-d379449d91b0"', async () => {
      const exportFile = '2e4663b7-aed2-4521-8819-d379449d91b0.application.json';
      const CMD = `frodo app export --app-id 2e4663b7-aed2-4521-8819-d379449d91b0`;
      await testExport(CMD, env, type, exportFile);
    });

    test('"frodo app export -n Azure": should export the app with app name "Azure"', async () => {
      const exportFile = 'Azure.application.json';
      const CMD = `frodo app export -n Azure`;
      await testExport(CMD, env, type, exportFile);
    });

    test('"frodo app export --app-name TestLDAP": should export the app with app name "TestLDAP"', async () => {
      const exportFile = 'TestLDAP.application.json';
      const CMD = `frodo app export --app-name TestLDAP`;
      await testExport(CMD, env, type, exportFile);
    });

    test('"frodo app export -n Azure -f my-Azure.application.json": should export the app with app name "Azure" into file named my-Azure.application.json', async () => {
      const exportFile = 'my-Azure.application.json';
      const CMD = `frodo app export -n Azure -f ${exportFile}`;
      await testExport(CMD, env, type, exportFile);
    });

    test('"frodo app export -n Azure --no-deps -f my-nodeps-Azure.application.json": should export the app with app name "Azure" with no dependencies into a file named my-nodeps-Azure.application.json', async () => {
      const exportFile = 'my-nodeps-Azure.application.json';
      const CMD = `frodo app export -n Azure --no-deps -f ${exportFile}`;
      await testExport(CMD, env, type, exportFile);
    });

    // TODO: Generate mocks for this test (skip for the meantime)
    test.skip('"frodo app export -Nn Azure -D appExportTestDir1": should export the app with app name "Azure" into the directory appExportTestDir1', async () => {
      const exportDirectory = 'appExportTestDir1';
      const CMD = `frodo app export -Nn Azure -D ${exportDirectory}`;
      await testExport(CMD, env, type, undefined, exportDirectory, false);
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

    // TODO: Generate mocks for this test (skip for the meantime)
    test.skip('"frodo app export -NaD appExportTestDir2": should export all apps to a single file in the directory appExportTestDir2', async () => {
      const exportDirectory = 'appExportTestDir2';
      const CMD = `frodo app export -NaD ${exportDirectory}`;
      await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo app export -A": should export all apps to separate files', async () => {
      const CMD = `frodo app export -A`;
      await testExport(CMD, env, type);
    });

    // TODO: Generate mocks for this test (skip for the meantime)
    test.skip('"frodo app export --all-separate --no-metadata --no-deps --directory appExportTestDir3": should export all apps to separate files in the directory appExportTestDir3', async () => {
      const exportDirectory = 'appExportTestDir3';
      const CMD = `frodo app export --all-separate --no-metadata --no-deps --directory ${exportDirectory}`;
      await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
  });

  describe.skip('ForgeOps', () => {
    test('"frodo app export -f forgeopsRootNoPrefixApps.application.json -am forgeops": should export all "application" apps to a single file', async () => {
      const exportFile = 'forgeopsRootNoPrefixApps.application.json';
      const CMD = `frodo app export -f forgeopsRootNoPrefixApps.application.json -am forgeops`;
      await testExport(CMD, {
        env: {
          ...forgeopsEnv.env,
          FRODO_TEST_NAME: 'rootNoPrefix',
        }
      }, type, exportFile);
    });

    test('"frodo app export --file forgeopsRootPrefixApps.application.json --all --use-realm-prefix-on-managed-objects --type forgeops": should export all "application" apps to a single file', async () => {
      const exportFile = 'forgeopsRootPrefixApps.application.json';
      const CMD = `frodo app export --file forgeopsRootPrefixApps.application.json --all --use-realm-prefix-on-managed-objects --type forgeops`;
      await testExport(CMD, {
        env: {
          ...forgeopsEnv.env,
          FRODO_TEST_NAME: 'rootPrefix',
        }
      }, type, exportFile);
    });

    test('"frodo app export -f forgeopsAlphaNoPrefixApps.application.json -am forgeops": should export all "application" apps to a single file', async () => {
      const exportFile = 'forgeopsAlphaNoPrefixApps.application.json';
      const CMD = `frodo app export -f forgeopsAlphaNoPrefixApps.application.json -am forgeops`;
      await testExport(CMD, {
        env: {
          ...forgeopsEnv.env,
          FRODO_REALM: 'alpha',
          FRODO_TEST_NAME: 'alphaNoPrefix',
        }
      }, type, exportFile);
    });

    test('"frodo app export --file forgeopsAlphaPrefixApps.application.json --all --use-realm-prefix-on-managed-objects --type forgeops": should export all "alpha_application" apps to a single file', async () => {
      const exportFile = 'forgeopsAlphaPrefixApps.application.json';
      const CMD = `frodo app export --file forgeopsAlphaPrefixApps.application.json --all --use-realm-prefix-on-managed-objects --type forgeops`;
      await testExport(CMD, {
        env: {
          ...forgeopsEnv.env,
          FRODO_REALM: 'alpha',
          FRODO_TEST_NAME: 'alphaPrefix',
        }
      }, type, exportFile);
    });

    test('"frodo app export -f forgeopsAlphaBravoNoPrefixApps.application.json -am forgeops": should export all "application" apps to a single file', async () => {
      const exportFile = 'forgeopsAlphaBravoNoPrefixApps.application.json';
      const CMD = `frodo app export -f forgeopsAlphaBravoNoPrefixApps.application.json -am forgeops`;
      await testExport(CMD, {
        env: {
          ...forgeopsEnv.env,
          FRODO_REALM: 'alpha/bravo',
          FRODO_TEST_NAME: 'alphaBravoNoPrefix',
        }
      }, type, exportFile);
    });

    test('"frodo app export --file forgeopsAlphaBravoPrefixApps.application.json --all --use-realm-prefix-on-managed-objects --type forgeops": should export all "bravo_application" apps to a single file', async () => {
      const exportFile = 'forgeopsAlphaBravoPrefixApps.application.json';
      const CMD = `frodo app export --file forgeopsAlphaBravoPrefixApps.application.json --all --use-realm-prefix-on-managed-objects --type forgeops`;
      await testExport(CMD, {
        env: {
          ...forgeopsEnv.env,
          FRODO_REALM: 'alpha/bravo',
          FRODO_TEST_NAME: 'alphaBravoPrefix',
        }
      }, type, exportFile);
    });
  });
});
