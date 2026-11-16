/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud. Record last, after config-manager-push-software-publishers and config-manager-pull-software-publishers: it
// deletes the software publisher zz-e2e-publisher of the alpha realm that the push created. Deleting ALL software publishers
// of a realm has no recorded case: a recording would have to delete every software publisher of a real tenant, and the alpha
// realm holds one that is not a throw-away. The unit tests and the guard tests of the delete group cover it.
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_NO_UPDATE_CHECK=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=deleteOne frodo config-manager delete oauth-software-publishers -n zz-e2e-publisher
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

describe('frodo config-manager delete oauth-software-publishers', () => {
    test(`"frodo config-manager delete oauth-software-publishers -n zz-e2e-publisher": should delete the software publisher zz-e2e-publisher from the alpha realm`, async () => {
        const CMD = `frodo config-manager delete oauth-software-publishers -n zz-e2e-publisher`;
        await testSuccess(CMD, {
            ...cloudEnv,
            env: { ...cloudEnv.env, FRODO_REALM: 'alpha', FRODO_TEST_NAME: 'deleteOne' },
        });
    });
});
