/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_D frodo config-manager pull services -D serviceTestDir

// Forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_directory_m frodo config-manager pull services --directory serviceTestDir1 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_TEST_NAME=0_D_n_m frodo config-manager pull services -D serviceTestDir2 -n SocialIdentityProviders -m forgeops
*/

import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

// Each FRODO_TEST_NAME is the recording's identity (the args id frodo-lib derives from the command): a changed flag does not move the recording.
describe('frodo config-manager pull services', () => {
  test('"frodo config-manager pull services -D cmServicesExportDir": should export the services in fr-config-manager style"', async () => {
    const dirName = 'cmServicesExportDir';
    const CMD = `frodo config-manager pull services -D ${dirName}`;
    await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_D' } }, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull services --directory serviceTestDir1 -m forgeops": should export the services in alpha realm in fr-config-manager style"', async () => {
    const dirName = 'serviceTestDir1';
    const CMD = `frodo config-manager pull services --directory ${dirName} -m forgeops`;
    await testExport(CMD, { env: {...forgeopsEnv.env, FRODO_REALM: 'alpha', FRODO_TEST_NAME: '0_directory_m' } }, undefined, undefined, dirName, false);
  });
  test('"frodo config-manager pull services -D serviceTestDir2 -n SocialIdentityProviders -m forgeops": should export the services with name: SocialIdentityProviders from alpha realm in fr-config-manager style"', async () => {
    const dirName = 'serviceTestDir2';
    const CMD = `frodo config-manager pull services -D ${dirName} -n SocialIdentityProviders -m forgeops`;
    await testExport(CMD, { env: {...forgeopsEnv.env, FRODO_REALM: 'alpha', FRODO_TEST_NAME: '0_D_n_m' } }, undefined, undefined, dirName, false);
  });
});