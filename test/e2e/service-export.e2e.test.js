/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -i policyconfiguration
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --service-id policyconfiguration -f my-policyconfiguration.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -Ni policyconfiguration -D serviceExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -gi dashboard
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --global --service-id dashboard -f my-dashboard.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -Ngi dashboard -D serviceExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --all --file my-allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -ga
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --global --all -f my-allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -NaD serviceExportTestDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -g --all-separate
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -A --no-metadata --directory serviceExportTestDir4
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'service';

describe('frodo service export', () => {
  test('"frodo service export -i policyconfiguration": should export the service with id "policyconfiguration"', async () => {
    const exportFile = 'policyconfiguration.service.json';
    const CMD = `frodo service export -i policyconfiguration`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export --service-id policyconfiguration -f my-policyconfiguration.service.json": should export the service with id "policyconfiguration" to the file my-policyconfiguration.service.json', async () => {
    const exportFile = 'my-policyconfiguration.service.json';
    const CMD = `frodo service export --service-id policyconfiguration -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export -Ni policyconfiguration -D serviceExportTestDir1": should export the service with id "policyconfiguration" to the directory serviceExportTestDir1', async () => {
    const exportDirectory = 'serviceExportTestDir1';
    const CMD = `frodo service export -Ni policyconfiguration -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo service export -gi dashboard": should export the global service with id "dashboard"', async () => {
    const exportFile = 'dashboard.service.json';
    const CMD = `frodo service export -gi dashboard`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export --global --service-id dashboard -f my-dashboard.service.json": should export the global service with id "dashboard" to the file my-dashboard.service.json', async () => {
    const exportFile = 'my-dashboard.service.json';
    const CMD = `frodo service export --global --service-id dashboard -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export -Ngi dashboard -D serviceExportTestDir2": should export the global service with id "dashboard" to the directory serviceExportTestDir2', async () => {
    const exportDirectory = 'serviceExportTestDir2';
    const CMD = `frodo service export -Ngi dashboard -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo service export -a": should export all services to a single file', async () => {
    const exportFile = 'allAlphaServices.service.json';
    const CMD = `frodo service export -a`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export --all --file my-allAlphaServices.service.json": should export all services to a single file named my-allAlphaServices.service.json', async () => {
    const exportFile = 'my-allAlphaServices.service.json';
    const CMD = `frodo service export --all --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export -ga": should export all global services to a single file', async () => {
    const exportFile = 'allGlobalServices.service.json';
    const CMD = `frodo service export -ga`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export --global --all -f my-allGlobalServices.service.json": should export all global services to a single file named my-allGlobalServices.service.json', async () => {
    const exportFile = 'my-allGlobalServices.service.json';
    const CMD = `frodo service export --global --all -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export -NaD serviceExportTestDir3": should export all services to a single file in the directory serviceExportTestDir3', async () => {
    const exportDirectory = 'serviceExportTestDir3';
    const CMD = `frodo service export -NaD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo service export -A": should export all services to separate files', async () => {
    const CMD = `frodo service export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo service export -g --all-separate": should export all global services to separate files', async () => {
    const CMD = `frodo service export -g --all-separate`;
    await testExport(CMD, env, type);
  });

  test('"frodo service export -A --no-metadata --directory serviceExportTestDir4": should export all services to separate files in the directory serviceExportTestDir4', async () => {
    const exportDirectory = "serviceExportTestDir4";
    const CMD = `frodo service export -A --no-metadata --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

});
