/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -n URL
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export --type-name URL -f my-URL.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -MNn URL -D authzTypeExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f my-76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -Ni 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -D authzTypeExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -a --file test.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -MNaD authzTypeExportTestDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export --modified-properties --all-separate --no-metadata --directory authzTypeExportTestDir4
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'resourcetype.authz';

describe('frodo authz type export', () => {
  test('"frodo authz type export -n URL": should export the resource type named "URL"', async () => {
    const exportFile = 'URL.resourcetype.authz.json';
    const CMD = `frodo authz type export -n URL`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export --type-name URL -f test.json": should export the resource type named "URL"', async () => {
    const exportFile = 'my-URL.resourcetype.authz.json';
    const CMD = `frodo authz type export --type-name URL -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export -MNn URL -D authzTypeExportTestDir1": should export the resource type named "URL" to the directory authzTypeExportTestDir1', async () => {
    const exportDirectory = 'authzTypeExportTestDir1';
    const CMD = `frodo authz type export -MNn URL -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo authz type export --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2": should export the resource type with id "76656a38-5f8e-401b-83aa-4ccb74ce88d2"', async () => {
    const exportFile =
      '76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json';
    const CMD = `frodo authz type export --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f my-76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json": should export the resource type with id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" into file named my-76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json', async () => {
    const exportFile =
      'my-76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json';
    const CMD = `frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export -Ni 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -D authzTypeExportTestDir2": should export the resource type with id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" into the directory authzTypeExportTestDir2', async () => {
    const exportDirectory = 'authzTypeExportTestDir2';
    const CMD = `frodo authz type export -Ni 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo authz type export --all": should export all resource types to a single file', async () => {
    const exportFile = 'allAlphaResourceTypes.resourcetype.authz.json';
    const CMD = `frodo authz type export --all`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export -a --file my-allAlphaResourceTypes.resourcetype.authz.json": should export all resource types to a single file named my-allAlphaResourceTypes.resourcetype.authz.json', async () => {
    const exportFile = 'my-allAlphaResourceTypes.resourcetype.authz.json';
    const CMD = `frodo authz type export -a --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export -MNaD authzTypeExportTestDir3": should export all resource types to a single file in the directory authzTypeExportTestDir3', async () => {
    const exportDirectory = 'authzTypeExportTestDir3';
    const CMD = `frodo authz type export -MNaD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo authz type export -A": should export all resource types to separate files', async () => {
    const CMD = `frodo authz type export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo authz type export --modified-properties --all-separate --no-metadata --directory authzTypeExportTestDir4": should export all resource types to separate files in the directory authzTypeExportTestDir4', async () => {
    const exportDirectory = "authzTypeExportTestDir4";
    const CMD = `frodo authz type export --modified-properties --all-separate --no-metadata --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });
});
