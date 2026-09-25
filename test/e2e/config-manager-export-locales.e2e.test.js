/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull locales -D testDir15
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull locales -n fr -D testDir16

*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pulls', () => {
  test('"frodo config-manager pull locales -D testDir15": should export the locales in fr-config-manager style"', async () => {
      const dirName = 'testDir15';
      const CMD = `frodo config-manager pull locales -D ${dirName}`;
      await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull locales -n fr -D testDir16": should export the locale named: fr in fr-config-manager style"', async () => {
      const dirName = 'testDir16';
      const CMD = `frodo config-manager pull locales -n fr -D ${dirName}`;
      await testExport(CMD, env, undefined, undefined, dirName, false);
    });
});