/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull saml -f test/e2e/fr-config-manager-pull-config/saml.json -D testDir22 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull saml -f test/e2e/fr-config-manager-pull-config/saml.json -D testDir23 --type forgeops
*/


import { getEnv, testExport } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager pull saml', () => {
  test('"frodo config-manager pull saml -f test/e2e/fr-config-manager-pull-config/saml.json -D testDir22 -m forgeops": should export the saml based on salm-config.json file in fr-config-manager style"', async () => {
    const dirName = 'testDir22';
    const CMD = `frodo config-manager pull saml -f test/e2e/fr-config-manager-pull-config/saml.json -D ${dirName} -m forgeops`;
    await testExport(CMD, forgeopsEnv, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull saml -f test/e2e/fr-config-manager-pull-config/saml.json -D testDir23 --type forgeops": should export the saml based on salm-config.json file in fr-config-manager style"', async () => {
    const dirName = 'testDir23';
    const CMD = `frodo config-manager pull saml -f test/e2e/fr-config-manager-pull-config/saml.json -D ${dirName} --type forgeops`;
    await testExport(CMD, { env: {...forgeopsEnv.env, FRODO_REALM: 'alpha' } }, undefined, undefined, dirName, false);
  });
});