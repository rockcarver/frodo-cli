/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull secrets -D secretTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull secrets -aD secretTestDir2

*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pulls', () => {
  test('"frodo config-manager pull secrets -D secretTestDir1": should export all secrets and their versions in fr-config-manager style"', async () => {
    const dirName = 'secretTestDir1';
    const CMD = `frodo config-manager pull secrets -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull secrets -aD secretTestDir2": should export all the active only secrets in fr-config-manager style"', async () => {
    const dirName = 'secretTestDir2';
    const CMD = `frodo config-manager pull secrets -aD ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
});