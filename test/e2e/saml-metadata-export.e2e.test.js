/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml metadata export -i iSPAzure
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml metadata export --entity-id iSPAzure -f my-iSPAzure.metadata.xml
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml metadata export -i iSPAzure -D samlMetadataExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml metadata export --entity-id iSPAzure --file test.xml --directory samlMetadataExportTestDir2
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'metadata';

describe('frodo saml metadata export', () => {
  test('"frodo saml metadata export -i iSPAzure": should export the saml metadata with entity id "iSPAzure"', async () => {
    const exportFile = 'iSPAzure.metadata.xml';
    const CMD = `frodo saml metadata export -i iSPAzure`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml metadata export -i iSPAzure -D samlMetadataExportTestDir1": should export the saml metadata with entity id "iSPAzure" to the directory samlMetadataExportTestDir1', async () => {
    const exportDirectory = 'samlMetadataExportTestDir1';
    const CMD = `frodo saml metadata export -i iSPAzure -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });

  test('"frodo saml metadata export --entity-id iSPAzure -f my-iSPAzure.metadata.xml": should export the saml metadata with entity id "iSPAzure" to the file my-iSPAzure.metadata.xml', async () => {
    const exportFile = 'my-iSPAzure.metadata.xml';
    const CMD = `frodo saml metadata export --entity-id iSPAzure -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml metadata export --entity-id iSPAzure --file test.xml --directory samlMetadataExportTestDir2": should export the saml metadata with entity id "iSPAzure" to the file test.xml in the directory samlMetadataExportTestDir2', async () => {
    const exportFile = 'test.xml';
    const exportDirectory = 'samlMetadataExportTestDir2';
    const CMD = `frodo saml metadata export --entity-id iSPAzure --file ${exportFile} --directory ${exportDirectory}`;
    await testExport(CMD, env, type, exportFile, exportDirectory);
  });
});
