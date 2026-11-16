/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud. Record last, after config-manager-push-cimd-profiles and config-manager-pull-cimd-profiles: it
// deletes the CIMD profile zz-e2e-cimd of the alpha realm that the push created. Deleting ALL CIMD profiles of a realm
// has no recorded case: a recording would have to delete every CIMD profile of a real realm. The unit tests and the guard tests
// of the delete group cover it.
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_NO_UPDATE_CHECK=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=deleteOne frodo config-manager delete oauth-cimd-profiles -n zz-e2e-cimd
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

describe('frodo config-manager delete oauth-cimd-profiles', () => {
    test(`"frodo config-manager delete oauth-cimd-profiles -n zz-e2e-cimd": should delete the CIMD profile zz-e2e-cimd from the alpha realm`, async () => {
        const CMD = `frodo config-manager delete oauth-cimd-profiles -n zz-e2e-cimd`;
        await testSuccess(CMD, {
            ...cloudEnv,
            env: { ...cloudEnv.env, FRODO_REALM: 'alpha', FRODO_TEST_NAME: 'deleteOne' },
        });
    });
});
