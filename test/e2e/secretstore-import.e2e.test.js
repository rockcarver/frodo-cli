/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore import -i ESV -f test/e2e/exports/all/allAlphaSecretStores.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore import --secretstore-id ESV --secretstore-type GoogleSecretManagerSecretStoreProvider -f test/e2e/exports/all/allAlphaSecretStores.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore import -af test/e2e/exports/all/allAlphaSecretStores.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/secretstore

// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore import -gf test/e2e/exports/all/allGlobalSecretStores.json -i default-keystore -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore import --global --all --file test/e2e/exports/all/allGlobalSecretStores.json --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore import -gm classic --all-separate --directory test/e2e/exports/all-separate/classic/global/secretstore
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

const allRealmFileName = `allAlphaSecretStores.json`;
const allGlobalFileName = `allGlobalSecretStores.json`;
const allRealmExport = `test/e2e/exports/all/${allRealmFileName}`
const allGlobalExport = `test/e2e/exports/all/${allGlobalFileName}`
const allSeparateRealmSecretStoresDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/secretstore`;
const allSeparateGlobalSecretStoresDirectory = `test/e2e/exports/all-separate/classic/global/secretstore`;

describe('frodo secretstore import', () => {
    test(`"frodo secretstore import -i ESV -f ${allRealmExport}": should import the ESV secret store`, async () => {
        const CMD = `frodo secretstore import -i ESV -f ${allRealmExport}`;
        await testSuccess(CMD, env);
    });
    test(`"frodo secretstore import --secretstore-id ESV --secretstore-type GoogleSecretManagerSecretStoreProvider -f ${allRealmExport}": should import the ESV secret store`, async () => {
        const CMD = `frodo secretstore import --secretstore-id ESV --secretstore-type GoogleSecretManagerSecretStoreProvider -f ${allRealmExport}`;
        await testSuccess(CMD, env);
    });
    test(`"frodo secretstore import -af ${allRealmExport}": should import all secret stores for realm`, async () => {
        const CMD = `frodo secretstore import -af ${allRealmExport}`;
        await testSuccess(CMD, env);
    });
    test(`"frodo secretstore import -AD ${allSeparateRealmSecretStoresDirectory}": should import all separate secret stores for realm`, async () => {
        const CMD = `frodo secretstore import -AD ${allSeparateRealmSecretStoresDirectory}`;
        await testSuccess(CMD, env);
    });
    test(`"frodo secretstore import -gf ${allGlobalExport} -i default-keystore -m classic": should import the default global keystore secret store`, async () => {
        const CMD = `frodo secretstore import -gf ${allGlobalExport} -i default-keystore -m classic`;
        await testSuccess(CMD, classicEnv);
    });
    test(`"frodo secretstore import --global --all --file ${allGlobalExport} --type classic": should import all global secret stores`, async () => {
        const CMD = `frodo secretstore import --global --all --file ${allGlobalExport} --type classic`;
        await testSuccess(CMD, classicEnv);
    });
    test(`"frodo secretstore import -gm classic --all-separate --directory ${allSeparateGlobalSecretStoresDirectory}": should import all separate global secret stores`, async () => {
        const CMD = `frodo secretstore import -gm classic --all-separate --directory ${allSeparateGlobalSecretStoresDirectory}`;
        await testSuccess(CMD, classicEnv);
    });
});
