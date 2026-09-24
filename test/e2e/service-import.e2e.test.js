/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import -i SocialIdentityProviders -f test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import -Cri baseurl -f test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import --service-id dashboard --global --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import --clean -g --service-id dashboard --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import -f test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import -Crf test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import --global --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import --clean --global --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import -af test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import --current-realm -Caf test/e2e/exports/all/allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import --all --global --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import --clean --global --all --file test/e2e/exports/all/allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/service
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import -ACrD test/e2e/exports/all-separate/cloud/realm/root-alpha/service
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import --global --all-separate --directory test/e2e/exports/all-separate/cloud/global/service
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service import --clean --global --all-separate --directory test/e2e/exports/all-separate/cloud/global/service
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
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
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import -Cri baseurl -f ${allAlphaServicesExport}": should import the service with the id "baseurl" from the file "${allAlphaServicesExport}", and clean the old one`, async () => {
    const CMD = `frodo service import -Cri baseurl -f ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --service-id dashboard --global --file ${allGlobalServicesExport}": should import the global service with the id "CorsService" from the file "${allGlobalServicesExport}"`, async () => {
    const CMD = `frodo service import --service-id dashboard --global --file ${allGlobalServicesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --clean -g --service-id dashboard --file ${allGlobalServicesExport}": should fail because global singleton services cannot be deleted (--clean option).`, async () => {
    const CMD = `frodo service import --clean -g --service-id dashboard --file ${allGlobalServicesExport}`;
    try {
      await exec(CMD, env);
      fail("Command should've failed");
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
  });

  test(`"frodo service import -f ${allAlphaServicesExport}": should import the first service from the file "${allAlphaServicesExport}"`, async () => {
    const CMD = `frodo service import -f ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import -Crf ${allAlphaServicesExport}": should import the first service from the file "${allAlphaServicesExport}", and clean the old one`, async () => {
    const CMD = `frodo service import -Crf ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --global --file ${allGlobalServicesExport}": should import the first global service from the file "${allGlobalServicesExport}"`, async () => {
    const CMD = `frodo service import --global --file ${allGlobalServicesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --clean --global --file ${allGlobalServicesExport}": should fail because global singleton services cannot be deleted (--clean option).`, async () => {
    const CMD = `frodo service import --clean --global --file ${allGlobalServicesExport}`;
    try {
      await exec(CMD, env);
      fail("Command should've failed");
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
  });

  test(`"frodo service import -af ${allAlphaServicesExport}": should import all services from the file "${allAlphaServicesExport}"`, async () => {
    const CMD = `frodo service import -af ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --current-realm -Caf ${allAlphaServicesExport}": should import all services from the file "${allAlphaServicesExport}", and clean the old ones`, async () => {
    const CMD = `frodo service import --current-realm -Caf ${allAlphaServicesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --all --global --file ${allGlobalServicesExport}": should import all global services from the file "${allGlobalServicesExport}"`, async () => {
    const CMD = `frodo service import --all --global --file ${allGlobalServicesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --clean --global --all --file ${allGlobalServicesExport}": should fail because global singleton services cannot be deleted (--clean option).`, async () => {
    const CMD = `frodo service import --clean --global --all --file ${allGlobalServicesExport}`;
    try {
      await exec(CMD, env);
      fail("Command should've failed");
    } catch (e) {
      expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
    }
  });

  test(`"frodo service import -AD ${allSeparateAlphaServicesDirectory}": should import all services from the directory "${allSeparateAlphaServicesDirectory}"`, async () => {
    const CMD = `frodo service import -AD ${allSeparateAlphaServicesDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import -ACrD ${allSeparateAlphaServicesDirectory}": should import all services from the directory "${allSeparateAlphaServicesDirectory}", and clean the old ones`, async () => {
    const CMD = `frodo service import -ACrD ${allSeparateAlphaServicesDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --global --all-separate --directory ${allSeparateGlobalServicesDirectory}": should import all global services from the directory "${allSeparateGlobalServicesDirectory}"`, async () => {
    const CMD = `frodo service import --global --all-separate --directory ${allSeparateGlobalServicesDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo service import --clean --global --all-separate --directory ${allSeparateGlobalServicesDirectory}": should import all global services from the directory "${allSeparateGlobalServicesDirectory}", and clean the old ones`, async () => {
    const CMD = `frodo service import --clean --global --all-separate --directory ${allSeparateGlobalServicesDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });
});
