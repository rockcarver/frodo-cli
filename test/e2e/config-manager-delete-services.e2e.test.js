/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=alpha frodo config-manager delete services -n email  -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager delete services -m forgeops  
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am FRODO_REALM=alpha frodo config-manager delete services --dry-run  -m forgeops 
*/


import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
// process.env['FRODO_CONNECTION_PROFILES_PATH'] =
//   './test/e2e/env/Connections.json';
const env = getEnv(fc);

describe('frodo config-manager delete', () => {
  test('"frodo config-manager delete services -n email  -m forgeops": should delete the named service in alpha realm"', async () => {
      const CMD = `frodo config-manager delete services -n email -m forgeops`;
      await testSuccess(CMD, {
        env: {
          ...env.env,
          FRODO_REALM: '/alpha',
        },
      });
    });
    
    test('"frodo config-manager delete services -m forgeops": should delete all the allowed services"', async () => {
      const CMD = `frodo config-manager delete services -m forgeops`;
      await testFail(CMD, env);
    });

    test('"frodo config-manager delete services --dry-run  -m forgeops": should show a dry run of which services would be deleted in alpha realm"', async () => {
      const CMD = `frodo config-manager delete services --dry-run  -m forgeops`;
      await testSuccess(CMD, {
        env: {
          ...env.env,
          FRODO_REALM: '/alpha',
        },
      });
    });
});