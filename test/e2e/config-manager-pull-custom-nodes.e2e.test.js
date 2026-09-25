/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull custom-nodes -D configManagerPullCustomNodesDir0 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull custom-nodes -D configManagerPullCustomNodesDir1 -n DoesUserExist -m forgeops
*/

import { getEnv, testExport } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(fc);

describe('frodo config-manager pull custom-nodes', () => {
    test(`"frodo config-manager pull custom-nodes -D configManagerPullCustomNodesDir0 -m forgeops": should export all custom-nodes in fr-config manager style.`, async () => {
        const dirName = 'configManagerPullCustomNodesDir0';
        const CMD = `frodo config-manager pull custom-nodes -D ${dirName} -m forgeops`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull custom-nodes -D configManagerPullCustomNodesDir1 -n DoesUserExist -m forgeops": should export custom node named: DoesUserExist`, async () => {
        const dirName = 'configManagerPullCustomNodesDir1';
        const CMD = `frodo config-manager pull custom-nodes -D ${dirName} -n DoesUserExist -m forgeops`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
});