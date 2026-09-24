/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export --idp-id google
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export -i google -f my-google.idp.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export -Ni google -D idpExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export -a --file my-allAlphaProviders.idp.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export -NaD idpExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export --all-separate --no-metadata --directory idpExportTestDir3
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'idp';

describe('frodo idp export', () => {
  test('"frodo idp export --idp-id google": should export the idp provider with idp id "google"', async () => {
    const exportFile = 'google.idp.json';
    const CMD = `frodo idp export --idp-id google`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo idp export -i google -f my-google.idp.json": should export the idp provider with idp id "google" into file named my-google.idp.json', async () => {
    const exportFile = 'my-google.idp.json';
    const CMD = `frodo idp export -i google -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo idp export -Ni google -D idpExportTestDir1": should export the idp provider with idp id "google" into the directory idpExportTestDir1', async () => {
    const exportDirectory = 'idpExportTestDir1';
    const CMD = `frodo idp export -Ni google -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo idp export --all": should export all idp providers to a single file', async () => {
    const exportFile = 'allAlphaProviders.idp.json';
    const CMD = `frodo idp export --all`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo idp export -a --file my-allAlphaProviders.idp.json": should export all idp providers to a single file named my-allAlphaProviders.idp.json', async () => {
    const exportFile = 'my-allAlphaProviders.idp.json';
    const CMD = `frodo idp export -a --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo idp export -NaD idpExportTestDir2": should export all idp providers to a single file in the directory idpExportTestDir2', async () => {
    const exportDirectory = 'idpExportTestDir2';
    const CMD = `frodo idp export -NaD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo idp export -A": should export all idp providers to separate files', async () => {
    const CMD = `frodo idp export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo idp export --all-separate --no-metadata --directory idpExportTestDir3": should export all idp providers to separate files in the directory idpExportTestDir3', async () => {
    const exportDirectory = "idpExportTestDir3";
    const CMD = `frodo idp export --all-separate --no-metadata --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });
});
