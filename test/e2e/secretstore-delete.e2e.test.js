/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore delete -i ESV
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore delete --all

// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore delete -g --secretstore-id EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore delete --global -i default-keystore --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore delete -agm classic
*/

import { getEnv, testFail, testSuccess } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const cloudEnv = getEnv(c);
const classicEnv = getEnv(cc);

describe('frodo secretstore delete', () => {
    describe('Cloud', () => {
        test('"frodo secretstore delete -i ESV": should fail deleting ESV secret store', async () => {
            const CMD = `frodo secretstore delete -i ESV`;
            await testFail(CMD, cloudEnv);
        });
        test('"frodo secretstore delete --all": should fail deleting any secret store', async () => {
            const CMD = `frodo secretstore delete --all`;
            await testFail(CMD, cloudEnv);
        });
    });
    describe('Classic', () => {
        test('"frodo secretstore delete -g --secretstore-id EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore -m classic": should fail deleting EnvironmentAndSystemPropertySecretStore', async () => {
            const CMD = `frodo secretstore delete -g --secretstore-id EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore -m classic`;
            await testFail(CMD, classicEnv);
        });
        test('"frodo secretstore delete --global -i default-keystore --type classic": should delete the global default keystore', async () => {
            const CMD = `frodo secretstore delete --global -i default-keystore --type classic`;
            await testSuccess(CMD, classicEnv);
        });
        test('"frodo secretstore delete -agm classic": should delete all global keystores with exception of EnvironmentAndSystemPropertySecretStore', async () => {
            const CMD = `frodo secretstore delete -agm classic`;
            await testFail(CMD, classicEnv);
        });
    });
});
