/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull secret-mappings -D secretMappingTestDir
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull secret-mappings -r alpha -D secretMappingTestDir
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull secret-mappings -r bravo -n es512 -D secretMappingTestDir

*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pulls', () => {
  test('"frodo config-manager pull secret-mappings -D secretMappingTestDir": should export the secret-mappings in fr-config-manager style"', async () => {
    const dirName = 'secretMappingTestDir';
    const CMD = `frodo config-manager pull  secret-mappings -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull secret-mappings -r alpha -D secretMappingTestDir": should export the secret-mappings in alpha realm in fr-config-manager style"', async () => {
    const dirName = 'secretMappingTestDir';
    const CMD = `frodo config-manager pull secret-mappings -r alpha -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull secret-mappings -r bravo -n es512 -D secretMappingTestDir": should export the secret-mappings with alias name:es512 in fr-config-manager style"', async () => {
    const dirName = 'secretMappingTestDir';
    const CMD = `frodo config-manager pull secret-mappings -r bravo -n es512 -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
});