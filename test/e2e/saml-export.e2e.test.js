/** See test/e2e/README.md for how to write and record e2e tests. */

/*
Create SAML configuration for testing:

FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -f test/e2e/exports/all/allAlphaProviders.saml.json
*/

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -i iSPAzure
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export --entity-id iSPAzure
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -i iSPAzure -f my-iSPAzure.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -Ni iSPAzure -D samlExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export --all --file my-allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -NaD samlExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export --all-separate --no-metadata --directory samlExportTestDir3
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'saml';

describe('frodo saml export', () => {
  test('"frodo saml export -i iSPAzure": should export the saml provider with entity id "iSPAzure"', async () => {
    const exportFile = 'iSPAzure.saml.json';
    const CMD = `frodo saml export -i iSPAzure`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml export --entity-id iSPAzure": should export the saml provider with entity id "iSPAzure"', async () => {
    const exportFile = 'iSPAzure.saml.json';
    const CMD = `frodo saml export --entity-id iSPAzure`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml export -i iSPAzure -f my-iSPAzure.saml.json": should export the saml provider with entity id "iSPAzure" into file named my-iSPAzure.saml.json', async () => {
    const exportFile = 'my-iSPAzure.saml.json';
    const CMD = `frodo saml export -i iSPAzure -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml export Ni iSPAzure -D samlExportTestDir1": should export the saml provider with entity id "iSPAzure" into the directory samlExportTestDir1', async () => {
    const exportDirectory = 'samlExportTestDir1';
    const CMD = `frodo saml export -Ni iSPAzure -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo saml export -a": should export all saml providers to a single file', async () => {
    const exportFile = 'allAlphaProviders.saml.json';
    const CMD = `frodo saml export -a`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml export --all --file my-allAlphaProviders.saml.json": should export all saml providers to a single file named my-allAlphaProviders.saml.json', async () => {
    const exportFile = 'my-allAlphaProviders.saml.json';
    const CMD = `frodo saml export --all --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml export -NaD samlExportTestDir2": should export all saml providers to a single file in the directory samlExportTestDir2', async () => {
    const exportDirectory = 'samlExportTestDir2';
    const CMD = `frodo saml export -NaD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo saml export -A": should export all saml providers to separate files', async () => {
    const CMD = `frodo saml export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo saml export --all-separate --no-metadata --directory samlExportTestDir3": should export all saml providers to separate files in the directory samlExportTestDir3', async () => {
    const exportDirectory = 'samlExportTestDir3';
    const CMD = `frodo saml export --all-separate --no-metadata --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });
});
