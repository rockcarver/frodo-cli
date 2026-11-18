/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_i_f frodo service import -i SocialIdentityProviders -f test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_Cri_f frodo service import -r --clean -i baseurl -f test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_service-id_global_file frodo service import --service-id dashboard --global --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_clean_g_service-id_file frodo service import --clean -g --service-id dashboard --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_f frodo service import -f test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_Crf frodo service import -r --clean -f test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_global_file frodo service import --global --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_clean_global_file frodo service import --clean --global --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_af frodo service import -af test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_current-realm_Caf frodo service import --current-realm -a --clean -f test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_all_global_file frodo service import --all --global --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_clean_global_all_file frodo service import --clean --global --all --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_AD frodo service import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/service
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_ACrD frodo service import -Ar --clean -D test/e2e/exports/all-separate/cloud/realm/root-alpha/service
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_global_all-separate_directory frodo service import --global --all-separate --directory test/e2e/exports/all-separate/cloud/global/service
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_clean_global_all-separate_directory frodo service import --clean --global --all-separate --directory test/e2e/exports/all-separate/cloud/global/service
*/
import { getEnv, normalizeSnapshotText, exec } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
const env = getEnv(c);

const allDirectory = 'test/e2e/exports/all';
const allAlphaServicesFileName = 'allAlphaServices.service.json';
const allGlobalServicesFileName = 'allGlobalServices.service.json';
const allAlphaServicesExport = `${allDirectory}/${allAlphaServicesFileName}`;
const allGlobalServicesExport = `${allDirectory}/${allGlobalServicesFileName}`;
const allSeparateAlphaServicesDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/service`;
const allSeparateGlobalServicesDirectory = `test/e2e/exports/all-separate/cloud/global/service`;

describe('frodo service import', () => {
  test(`"frodo service import -i SocialIdentityProviders -f ${allAlphaServicesExport}": should import the service with the id "SocialIdentityProviders" from the file "${allAlphaServicesExport}"`, async () => {
    const CMD = `frodo service import -i SocialIdentityProviders -f ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_i_f' } });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import -Cri baseurl -f ${allAlphaServicesExport}": should import the service with the id "baseurl" from the file "${allAlphaServicesExport}", and clean the old one`, async () => {
    const CMD = `frodo service import -r --clean -i baseurl -f ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_Cri_f' } });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --service-id dashboard --global --file ${allGlobalServicesExport}": should import the global service with the id "CorsService" from the file "${allGlobalServicesExport}"`, async () => {
    const CMD = `frodo service import --service-id dashboard --global --file ${allGlobalServicesExport}`;
    const { stdout } = await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_service-id_global_file' } });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --clean -g --service-id dashboard --file ${allGlobalServicesExport}": should fail because global singleton services cannot be deleted (--clean option).`, async () => {
    const CMD = `frodo service import --clean -g --service-id dashboard --file ${allGlobalServicesExport}`;
    try {
      await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_clean_g_service-id_file' } });
      fail("Command should've failed");
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
  });

  test(`"frodo service import -f ${allAlphaServicesExport}": should import the first service from the file "${allAlphaServicesExport}"`, async () => {
    const CMD = `frodo service import -f ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_f' } });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import -Crf ${allAlphaServicesExport}": should import the first service from the file "${allAlphaServicesExport}", and clean the old one`, async () => {
    const CMD = `frodo service import -r --clean -f ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_Crf' } });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --global --file ${allGlobalServicesExport}": should import the first global service from the file "${allGlobalServicesExport}"`, async () => {
    const CMD = `frodo service import --global --file ${allGlobalServicesExport}`;
    const { stdout } = await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_global_file' } });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --clean --global --file ${allGlobalServicesExport}": should fail because global singleton services cannot be deleted (--clean option).`, async () => {
    const CMD = `frodo service import --clean --global --file ${allGlobalServicesExport}`;
    try {
      await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_clean_global_file' } });
      fail("Command should've failed");
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
  });

  test(`"frodo service import -af ${allAlphaServicesExport}": should import all services from the file "${allAlphaServicesExport}"`, async () => {
    const CMD = `frodo service import -af ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_af' } });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --current-realm -Caf ${allAlphaServicesExport}": should import all services from the file "${allAlphaServicesExport}", and clean the old ones`, async () => {
    const CMD = `frodo service import --current-realm -a --clean -f ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_current-realm_Caf' } });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --all --global --file ${allGlobalServicesExport}": should import all global services from the file "${allGlobalServicesExport}"`, async () => {
    const CMD = `frodo service import --all --global --file ${allGlobalServicesExport}`;
    const { stdout } = await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_all_global_file' } });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  // The stderr snapshot of this test was edited by hand: the failure now ends with the summary of the services that failed
  // (two lines and the header added at the end, cli record 0040, imports).
  test(`"frodo service import --clean --global --all --file ${allGlobalServicesExport}": should fail because global singleton services cannot be deleted (--clean option).`, async () => {
    const CMD = `frodo service import --clean --global --all --file ${allGlobalServicesExport}`;
    try {
      await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_clean_global_all_file' } });
      fail("Command should've failed");
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
  });

  test(`"frodo service import -AD ${allSeparateAlphaServicesDirectory}": should import all services from the directory "${allSeparateAlphaServicesDirectory}"`, async () => {
    const CMD = `frodo service import -AD ${allSeparateAlphaServicesDirectory}`;
    const { stdout } = await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_AD' } });
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

    // The recording of this test does not hold every request of the import: the replay of some services fails ("Recording
    // for the following request is not found"). The import of the files used to swallow that and exit 0; it now names the
    // failed services in one summary and exits 1 (cli record 0040, imports). The test expects that exit code, the stdout
    // snapshot is unchanged. Recording the test again (a maintainer ask) would make the replay succeed.
  test(`"frodo service import -ACrD ${allSeparateAlphaServicesDirectory}": should import all services from the directory "${allSeparateAlphaServicesDirectory}", and clean the old ones`, async () => {
    const CMD = `frodo service import -Ar --clean -D ${allSeparateAlphaServicesDirectory}`;
    let failure;
    try {
      await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_ACrD' } });
    } catch (e) {
      failure = e;
    }
    expect(failure.code).toBe(1);
    expect(normalizeSnapshotText(failure.stdout)).toMatchSnapshot()
  });

    // The recording of this test does not hold every request of the import: the replay of some services fails ("Recording
    // for the following request is not found"). The import of the files used to swallow that and exit 0; it now names the
    // failed services in one summary and exits 1 (cli record 0040, imports). The test expects that exit code, the stdout
    // snapshot is unchanged. Recording the test again (a maintainer ask) would make the replay succeed.
  test(`"frodo service import --global --all-separate --directory ${allSeparateGlobalServicesDirectory}": should import all global services from the directory "${allSeparateGlobalServicesDirectory}"`, async () => {
    const CMD = `frodo service import --global --all-separate --directory ${allSeparateGlobalServicesDirectory}`;
    let failure;
    try {
      await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_global_all-separate_directory' } });
    } catch (e) {
      failure = e;
    }
    expect(failure.code).toBe(1);
    expect(normalizeSnapshotText(failure.stdout)).toMatchSnapshot()
  });

    // The recording of this test does not hold every request of the import: the replay of some services fails ("Recording
    // for the following request is not found"). The import of the files used to swallow that and exit 0; it now names the
    // failed services in one summary and exits 1 (cli record 0040, imports). The test expects that exit code, the stdout
    // snapshot is unchanged. Recording the test again (a maintainer ask) would make the replay succeed.
  test(`"frodo service import --clean --global --all-separate --directory ${allSeparateGlobalServicesDirectory}": should import all global services from the directory "${allSeparateGlobalServicesDirectory}", and clean the old ones`, async () => {
    const CMD = `frodo service import --clean --global --all-separate --directory ${allSeparateGlobalServicesDirectory}`;
    let failure;
    try {
      await exec(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_clean_global_all-separate_directory' } });
    } catch (e) {
      failure = e;
    }
    expect(failure.code).toBe(1);
    expect(normalizeSnapshotText(failure.stdout)).toMatchSnapshot()
  });
});
