/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull org-privileges -D configManagerExportOrgPrivilegesDir0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull org-privileges -n alphaOrgPrivileges -D configManagerExportOrgPrivilegesDir1
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);

// Each FRODO_TEST_NAME is the recording's identity (the args id frodo-lib derives from the command): a changed flag does not move the recording.
describe('frodo config-manager pull org-privileges', () => {
    test('"frodo config-manager pull org-privileges -D configManagerExportOrgPrivilegesDir0": should export all the realms organizations privileges in fr-config manager style.', async () => {
        const dirName = 'configManagerExportOrgPrivilegesDir0';
        const CMD = `frodo config-manager pull org-privileges -D ${dirName}`;
        await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_D' } }, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull org-privileges -n alphaOrgPrivileges -D configManagerExportOrgPrivilegesDir1": should export on alpha realm organizations privileges in fr-config manager style.', async () => {
        const dirName = 'configManagerExportOrgPrivilegesDir1';
        const CMD = `frodo config-manager pull org-privileges -n alphaOrgPrivileges -D ${dirName}`;
        await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_n_D' } }, undefined, undefined, dirName, false);
    });
});