/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull secret-mappings -D secretMappingTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull secret-mappings --directory secretMappingTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull secret-mappings -n esv-ping-one-worker-secret -D secretMappingTestDir3

*/


import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pulls', () => {
  test('"frodo config-manager pull secret-mappings -D secretMappingTestDir1": should export the secret-mappings in fr-config-manager style"', async () => {
    const dirName = 'secretMappingTestDir1';
    const CMD = `frodo config-manager pull  secret-mappings -D ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull secret-mappings --directory secretMappingTestDir2": should export the secret-mappings in alpha realm in fr-config-manager style"', async () => {
    const dirName = 'secretMappingTestDir2';
    const CMD = `frodo config-manager pull secret-mappings --directory ${dirName}`;
    await testExport(CMD, { env: {...env.env, FRODO_REALM: 'alpha' } }, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull secret-mappings -n esv-ping-one-worker-secret -D secretMappingTestDir3": should export the secret-mapping in alpha realm with alias name: esv-ping-one-worker-secret in fr-config-manager style"', async () => {
    const dirName = 'secretMappingTestDir3';
    const CMD = `frodo config-manager pull secret-mappings -n esv-ping-one-worker-secret -D ${dirName}`;
    await testExport(CMD, { env: {...env.env, FRODO_REALM: 'alpha' } }, undefined, undefined, dirName, false);
  });
});