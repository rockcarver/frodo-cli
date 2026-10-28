/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull password-policy -D testDir19

// Forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull password-policy -D testDir20 -m forgeops

*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager pulls', () => {
  test('"frodo config-manager pull password-policy -D testDir19": should export the password-policy in fr-config-manager style"', async () => {
    const dirName = 'testDir19';
    const CMD = `frodo config-manager pull password-policy -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull password-policy -D testDir20 -m forgeops": should export the password-policy in alpha realm in fr-config-manager style"', async () => {
    const dirName = 'testDir20';
    const CMD = `frodo config-manager pull password-policy -D ${dirName} -m forgeops`;
    await testExport(CMD, { env: {...forgeopsEnv.env, FRODO_REALM: 'alpha' } }, undefined, undefined, dirName, false);
  });
});