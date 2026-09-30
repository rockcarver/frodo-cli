/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir1

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir2 -m forgeops
*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager pull all', () => {
  test('"frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir1": should export all config in alpha realm in fr-config-manager style"', async () => {
    const dirName = 'allDir1';
    const CMD = `frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D ${dirName}`;
    await testExport(CMD, { env: {...env.env, FRODO_REALM: 'alpha' } }, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D allDir2 -m forgeops": should export all config in fr-config-manager style"', async () => {
    const dirName = 'allDir2';
    const CMD = `frodo config-manager pull all -C test/e2e/fr-config-manager-pull-config -D ${dirName} -m forgeops`;
    await testExport(CMD, forgeopsEnv, undefined, undefined, dirName, false);
  });
});
