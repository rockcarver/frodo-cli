/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull all-static -D allStaticDir1

// Cloud, all realms (no realm given, so nothing is filtered)
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_TEST_NAME=allRealms FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull all-static -D allStaticDir3

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull all-static -D allStaticDir2 -m forgeops
*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager pulls', () => {
   test('"frodo config-manager pull all-static -D allStaticDir1": should export the all-static in fr-config-manager style"', async () => {
     const dirName = 'allStaticDir1';
     const CMD = `frodo config-manager pull all-static -D ${dirName}`;
     await testExport(CMD, { env: {...env.env, FRODO_REALM: 'alpha' } }, undefined, undefined, dirName, false);
   });
   test('"frodo config-manager pull all-static -D allStaticDir3": should export the all-static of all realms in fr-config-manager style"', async () => {
     const dirName = 'allStaticDir3';
     const CMD = `frodo config-manager pull all-static -D ${dirName}`;
     await testExport(CMD, { env: {...env.env, FRODO_TEST_NAME: 'allRealms' } }, undefined, undefined, dirName, false);
   });
   test('"frodo config-manager pull all-static -D allStaticDir2 -m forgeops": should export the all-static in fr-config-manager style"', async () => {
    const dirName = 'allStaticDir2';
    const CMD = `frodo config-manager pull all-static -D ${dirName} -m forgeops`;
    await testExport(CMD, forgeopsEnv, undefined, undefined, dirName, false);
  });
});