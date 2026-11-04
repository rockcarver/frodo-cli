/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull authz-policies -f test/e2e/fr-config-manager-pull-config/authz-policies.json -D configManagerPullAuthzPoliciesDir -m forgeops
*/

import { getEnv, testExport } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(fc);

describe('frodo config-manager pull authz-policies', () => {
    test('"frodo config-manager pull authz-policies -f test/e2e/fr-config-manager-pull-config/authz-policies.json -D configManagerPullAuthzPoliciesDir -m forgeops": should export policies, policy-sets, and resource-types from all realms in fr-config manager style.', async () => {
        const dirName = 'configManagerPullAuthzPoliciesDir';
        const CMD = `frodo config-manager pull authz-policies -f test/e2e/fr-config-manager-pull-config/authz-policies.json -D ${dirName} -m forgeops`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
});