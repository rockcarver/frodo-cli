/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud. Record last, after config-manager-push-trusted-jwt-issuers and config-manager-pull-trusted-jwt-issuers: it
// deletes the trusted JWT issuer zz-e2e-issuer of the alpha realm that the push created. Deleting ALL issuers of a realm
// has no recorded case: a recording would have to delete every issuer of a real tenant. The unit tests and the guard tests
// of the delete group cover it.
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_NO_UPDATE_CHECK=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=deleteOne frodo config-manager delete oauth-issuers -n zz-e2e-issuer
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

describe('frodo config-manager delete oauth-issuers', () => {
    test(`"frodo config-manager delete oauth-issuers -n zz-e2e-issuer": should delete the trusted JWT issuer zz-e2e-issuer from the alpha realm`, async () => {
        const CMD = `frodo config-manager delete oauth-issuers -n zz-e2e-issuer`;
        await testSuccess(CMD, {
            ...cloudEnv,
            env: { ...cloudEnv.env, FRODO_REALM: 'alpha', FRODO_TEST_NAME: 'deleteOne' },
        });
    });
});
