/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull themes -D themeTestDir

*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pull themes -D themeTestDir', () => {
  test('"frodo config-manager pull test": should receive access tokens"', async () => {
    const dirName = 'themeTestDir';
    const CMD = `frodo config-manager pull themes -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
    });
});