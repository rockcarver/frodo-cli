/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push scripts -FD test/e2e/exports/fr-config-manager/forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_REALM=/ frodo config-manager push scripts --directory test/e2e/exports/fr-config-manager/forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_REALM=alpha frodo config-manager push scripts --force-update --name testing -D test/e2e/exports/fr-config-manager/forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_REALM=/ frodo config-manager push scripts -Ff 'Debug,~Next' -D test/e2e/exports/fr-config-manager/forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/fr-config-manager/forgeops";

describe('frodo config-manager push scripts', () => {
    test(`"frodo config-manager push scripts -FD ${allDirectory}": should import the scripts`, async () => {
        const CMD = `frodo config-manager push scripts -FD ${allDirectory}`;
        await testSuccess(CMD, env);
    });
    test(`"frodo config-manager push scripts --directory ${allDirectory}": should not import the scripts when no changes made`, async () => {
        const CMD = `frodo config-manager push scripts --directory ${allDirectory}`;
        await testSuccess(CMD, {
            env: {
                ...env.env,
                FRODO_REALM: '/'
            }
        });
    });
    test(`"frodo config-manager push scripts --force-update --name testing -D ${allDirectory}": should import the scripts`, async () => {
        const CMD = `frodo config-manager push scripts --force-update --name testing -D ${allDirectory}`;
        await testSuccess(CMD, {
            env: {
                ...env.env,
                FRODO_REALM: 'alpha'
            }
        });
    });
    test(`"frodo config-manager push scripts -Ff 'Debug,~Next' -D ${allDirectory}": should import the scripts`, async () => {
        const CMD = `frodo config-manager push scripts -Ff 'Debug,~Next' -D ${allDirectory}`;
        await testSuccess(CMD, {
            env: {
                ...env.env,
                FRODO_REALM: '/'
            }
        });
    });
});
