/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore export -Ni ESV -t GoogleSecretManagerSecretStoreProvider -f myFrodoExport.secretstore.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore export -Na
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore export -NAD secretStoreExportTestDir1

// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore export --global --secretstore-id EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore export -g --all -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore export -gam classic --no-metadata --file myFrodoExport2.secretstore.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore export -gm classic --all-separate --directory secretStoreExportTestDir2
*/

import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

const type = 'secretstore';

describe('frodo secretstore export', () => {
    test('"frodo secretstore export -Ni ESV -t GoogleSecretManagerSecretStoreProvider -f myFrodoExport.secretstore.json": should export the ESV secret store', async () => {
        const exportFile = 'myFrodoExport.secretstore.json';
        const CMD = `frodo secretstore export -Ni ESV -t GoogleSecretManagerSecretStoreProvider -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile, undefined, false);
    });
    test('"frodo secretstore export -Na": should export all secretstores in realm to file', async () => {
        const exportFile = 'allAlphaSecretStores.secretstore.json';
        const CMD = `frodo secretstore export -Na`;
        await testExport(CMD, env, type, exportFile, undefined, false);
    });
    test('"frodo secretstore export -NAD secretStoreExportTestDir1": should export all seceretstores in realm to separate files', async () => {
        const exportDirectory = 'secretStoreExportTestDir1';
        const CMD = `frodo secretstore export -NAD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
    test('"frodo secretstore export --global --secretstore-id EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore --type classic": should export the global EnvironmentAndSystemPropertySecretStore secret store', async () => {
        const exportFile = 'EnvironmentAndSystemPropertySecretStore.secretstore.json';
        const CMD = `frodo secretstore export --global --secretstore-id EnvironmentAndSystemPropertySecretStore --secretstore-type EnvironmentAndSystemPropertySecretStore --type classic`;
        await testExport(CMD, classicEnv, type, exportFile);
    });
    test('"frodo secretstore export -g --all -m classic": should export all global secretstores to file', async () => {
        const exportFile = 'allGlobalSecretStores.secretstore.json';
        const CMD = `frodo secretstore export -g --all -m classic`;
        await testExport(CMD, classicEnv, type, exportFile);
    });
    test('"frodo secretstore export -gam classic --no-metadata --file myFrodoExport2.secretstore.json": should export all global secretstores to specific file with no metadata', async () => {
        const exportFile = 'myFrodoExport2.secretstore.json';
        const CMD = `frodo secretstore export -gam classic --no-metadata --file ${exportFile}`;
        await testExport(CMD, classicEnv, type, exportFile, undefined, false);
    });
    test('"frodo secretstore export -gm classic --all-separate --directory secretStoreExportTestDir2": should export all global seceretstores to separate files', async () => {
        const exportDirectory = 'secretStoreExportTestDir2';
        const CMD = `frodo secretstore export -gm classic --all-separate --directory ${exportDirectory}`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory);
    });
});
