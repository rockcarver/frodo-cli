/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir0 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir1 -p Scripted -p Library -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=alpha FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir2 --prefix OAUTH2 --prefix SAML -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_REALM=bravo FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir3 -n 'Library Script' -m forgeops
*/

import { getEnv, testExport } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const forgeopsEnv = getEnv(fc);

describe('frodo config-manager pull scripts', () => {
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir0 -m forgeops": should export all scripts from all realms in fr-config-manager style.`, async () => {
        const dirName = 'configManagerExportScriptsDir0';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -m forgeops`;
        await testExport(CMD, forgeopsEnv, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir1 -p Scripted -p Library -m forgeops": should export scripts prefixed: Scripted & Library from all realms in fr-config-manager style.`, async () => {
        const dirName = 'configManagerExportScriptsDir1';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -p Scripted -p Library -m forgeops`;
        await testExport(CMD, forgeopsEnv, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir2 --prefix OAUTH2 --prefix SAML -m forgeops": should export scripts prefixed: OAUTH2 & SAML from alpha realm in fr-config-manager style.`, async () => {
        const dirName = 'configManagerExportScriptsDir2';
        const CMD = `frodo config-manager pull scripts -D ${dirName} --prefix OAUTH2 --prefix SAML -m forgeops`;
        await testExport(CMD, { env: {...forgeopsEnv.env, FRODO_REALM: 'alpha' } }, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir3 -n 'Library Script' -m forgeops": should export the script named 'Library Script' from bravo realm in fr-config-manager style.`, async () => {
        const dirName = 'configManagerExportScriptsDir3';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -n 'Library Script' -m forgeops`;
        await testExport(CMD, { env: {...forgeopsEnv.env, FRODO_REALM: 'bravo' } }, undefined, undefined, dirName, false);
    });
});