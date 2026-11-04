/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push cookie-domains -D test/e2e/exports/fr-config-manager/cloud
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

const allDirectory = "test/e2e/exports/fr-config-manager/cloud";

describe('frodo config-manager push cookie-domains', () => {
    test(`"frodo config-manager push cookie-domains -D ${allDirectory} ": should import the cookie-domains into cloud"`, async () => {
        const CMD = `frodo config-manager push cookie-domains -D ${allDirectory}`;
        await testSuccess(CMD, cloudEnv);
    });
});