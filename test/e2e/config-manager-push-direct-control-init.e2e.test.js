/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am frodo config-manager push direct-control-abort
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_HOSTS="https://openam-mtc-feb16-stg.forgeblocks.com" FRODO_HOST=https://openam-mtc-feb16-stg.forgeblocks.com/am direct-control-init
*/
import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';



process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo config-manager push direct-control-init', () => {
    test('"frodo config-manager push direct-control-init": should initialize a new direct configuration session', async () => {
        const CMD = `frodo config-manager push direct-control-init`;
        await testSuccess(CMD, env);
    });
});
