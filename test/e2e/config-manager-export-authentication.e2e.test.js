/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull authentication -D testDir2

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=bravo FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull authentication -D testDir3 -m forgeops
*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc} from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc)

describe('frodo config-manager pulls', () => {
   test('"frodo config-manager pull authentication -D cmAuthnExportDir2": should export the authentication in fr-config-manager style"', async () => {
      const dirName = 'cmAuthnExportDir2';
      const CMD = `frodo config-manager pull authentication -D ${dirName}`;
      await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull authentication -D testDir3 -m forgeops": should export the authentication in bravo realm in fr-config-manager style"', async () => {
        const dirName = 'testDir3';
        const CMD = `frodo config-manager pull authentication -D ${dirName} -m forgeops`;
        await testExport(CMD, { env: {...forgeopsEnv.env, FRODO_REALM: 'bravo' } }, undefined, undefined, dirName, false);
      });
    
});