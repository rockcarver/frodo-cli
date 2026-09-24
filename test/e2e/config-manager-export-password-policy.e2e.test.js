/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull password-policy -D testDir19
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull password-policy -D testDir20 -r alpha

*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pulls', () => {
  test('"frodo config-manager pull password-policy -D testDir19": should export the password-policy in fr-config-manager style"', async () => {
    const dirName = 'testDir19';
    const CMD = `frodo config-manager pull password-policy -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull password-policy -D testDir20 -r alpha": should export the password-policy in alpha realm in fr-config-manager style"', async () => {
    const dirName = 'testDir20';
    const CMD = `frodo config-manager pull password-policy -D ${dirName} -r alpha`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
});