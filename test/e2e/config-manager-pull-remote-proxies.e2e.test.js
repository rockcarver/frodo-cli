/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud. Record after the push test has created the proxy zz-e2e-proxy, before it is deleted again.
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull remote-proxies -n zz-e2e-proxy -D testDir25
*/

import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pull remote-proxies', () => {
  test('"frodo config-manager pull remote-proxies -n zz-e2e-proxy -D testDir25": should export one remote proxy in fr-config-manager style"', async () => {
    const dirName = 'testDir25';
    const CMD = `frodo config-manager pull remote-proxies -n zz-e2e-proxy -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
});
