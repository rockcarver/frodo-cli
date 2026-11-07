/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud. The fixture is a disabled proxy with an ESV placeholder as its secret and an address that cannot
// be reached. Record on a development tenant and delete the proxy again afterwards:
// frodo idm remote-proxy delete -i zz-e2e-proxy
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push remote-proxies -n zz-e2e-proxy -D test/e2e/exports/fr-config-manager/cloud
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

const allDirectory = "test/e2e/exports/fr-config-manager/cloud";

describe('frodo config-manager push remote-proxies', () => {
    test(`"frodo config-manager push remote-proxies -n zz-e2e-proxy -D ${allDirectory}": should import one remote proxy into cloud"`, async () => {
        const CMD = `frodo config-manager push remote-proxies -n zz-e2e-proxy -D ${allDirectory}`;
        await testSuccess(CMD, cloudEnv);
    });
});
