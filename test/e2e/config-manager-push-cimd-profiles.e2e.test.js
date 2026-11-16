/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud. Record the three files of the kind in the order push, pull, delete: the CIMD profile zz-e2e-cimd must
// not exist in the alpha realm before the push, and is gone after the delete. The fixture it is created from is
// test/e2e/exports/fr-config-manager/cloud/realms/alpha/realm-config/agents/CIMDProfile/zz-e2e-cimd.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_NO_UPDATE_CHECK=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=pushOne frodo config-manager push oauth-cimd-profiles -n zz-e2e-cimd -D test/e2e/exports/fr-config-manager/cloud
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

const allDirectory = 'test/e2e/exports/fr-config-manager/cloud';

describe('frodo config-manager push oauth-cimd-profiles', () => {
    test(`"frodo config-manager push oauth-cimd-profiles -n zz-e2e-cimd -D ${allDirectory}": should create the CIMD profile zz-e2e-cimd in the alpha realm`, async () => {
        const CMD = `frodo config-manager push oauth-cimd-profiles -n zz-e2e-cimd -D ${allDirectory}`;
        await testSuccess(CMD, {
            ...cloudEnv,
            env: { ...cloudEnv.env, FRODO_REALM: 'alpha', FRODO_TEST_NAME: 'pushOne' },
        });
    });
});
