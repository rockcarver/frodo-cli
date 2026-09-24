/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authn export -ND authnExportDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authn export -f authnExportTest.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authn export --no-metadata --file authnExportTest.json --directory  authnExportDir2
// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo authn export -g -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo authn export --global --no-metadata --directory authnExportDir3 --type classic
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const cloudEnv = getEnv(c);
const classicEnv = getEnv(cc);

const type = 'authentication.settings';

describe('frodo authn export', () => {
    describe('Cloud', () => {
        test('"frodo authn export -ND authnExportDir1": should export authentication settings to a single file in the "authnExportDir1" directory', async () => {
            const exportFile = "alphaRealm.authentication.settings.json";
            const exportDirectory = "authnExportDir1";
            const CMD = `frodo authn export -ND ${exportDirectory}`;
            await testExport(CMD, cloudEnv, type, exportFile, exportDirectory, false);
        });

        test('"frodo authn export -f authnExportTest.json": should export authentication settings to a file named "authnExportTest.json"', async () => {
            const exportFile = "authnExportTest.json";
            const CMD = `frodo authn export -f ${exportFile}`;
            await testExport(CMD, cloudEnv, type, exportFile);
        });

        test('"frodo authn export --no-metadata --file authnExportTest.json --directory  authnExportDir2": should export authentication settings to a file named "authnExportTest.json" in the "authnExportDir2" directory', async () => {
            const exportFile = "authnExportTest.json";
            const exportDirectory = "authnExportDir2";
            const CMD = `frodo authn export --no-metadata --file ${exportFile} --directory ${exportDirectory}`;
            await testExport(CMD, cloudEnv, type, exportFile, exportDirectory, false);
        });
    });

    describe('Classic', () => {
        test('"frodo authn export -g -m classic": should export global authentication settings to a file', async () => {
            const exportFile = "global.authentication.settings.json";
            const CMD = `frodo authn export -g -m classic`;
            await testExport(CMD, classicEnv, type, exportFile);
        });

        test('"frodo authn export --global --no-metadata --directory  authnExportDir3 --type classic": should export global authentication settings to a file in the "authnExportDir3" directory', async () => {
            const exportFile = "global.authentication.settings.json";
            const exportDirectory = "authnExportDir3";
            const CMD = `frodo authn export --global --no-metadata --directory ${exportDirectory} --type classic`;
            await testExport(CMD, classicEnv, type, exportFile, exportDirectory, false);
        });
    });
});
