/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull all -F test/e2e/fr-config-manager-pull-config -D allDir1

*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pulls', () => {
   test('"frodo config-manager pull all -F test/e2e/fr-config-manager-pull-config -D allDir1": should export all config in fr-config-manager style"', async () => {
     const dirName = 'allDir1';
     const fileName= 'test/e2e/fr-config-manager-pull-config';
     const CMD = `frodo config-manager pull all -F ${fileName} -D ${dirName}`;
     await testExport(CMD, env, undefined, undefined, dirName, false);
   });
 
});