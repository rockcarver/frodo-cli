/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo config-manager push direct-control-init
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS="https://openam-mtc-feb16-stg.forgeblocks.com" FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo config-manager push direct-control-apply
FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo config-manager push direct-control-abort
FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo config-manager push direct-control-init
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS="https://openam-mtc-feb16-stg.forgeblocks.com" FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo config-manager push direct-control-apply -w
FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo config-manager push direct-control-abort
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';


process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo config-manager push direct-control-apply', () => {
    test('"frodo config-manager push direct-control-apply": should apply the configuration and end the current direct configuration session', async () => {
        const CMD = `frodo config-manager push direct-control-apply`;
        await testSuccess(CMD, env);
        });
    test('"frodo config-manager push direct-control-apply": should apply the configuration and wait until the direct configuration session is ended', async () => {
        const CMD = `frodo config-manager push direct-control-apply -w`;
        await testSuccess(CMD, env);
        });
});
