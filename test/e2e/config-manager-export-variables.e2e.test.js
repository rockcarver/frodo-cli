/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull variables -D variableTestDir
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull variables -r


*/


import { getEnv, testExport, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pulls', () => {
  test('"frodo config-manager pull variables -D variableTestDir": should export the secrets in fr-config-manager style"', async () => {
    const dirName = 'variableTestDir';
    const CMD = `frodo config-manager pull variables -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });

    test('"frodo config-manager pull variables -r": should report all variables as a csv table report in fr-config-manager style"', async () => {
      const CMD = `frodo config-manager pull variables -r`;
      await testSuccess(CMD, env);
    });

});