/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_D_f frodo config-manager pull raw -D configManagerExportRawDir0 --config-file test/e2e/fr-config-manager-pull-config/raw.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_config-file_path_D frodo config-manager pull raw --config-file test/e2e/fr-config-manager-pull-config/raw.json --path /environment/release -D configManagerExportRawDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_stdout_config-file frodo config-manager pull raw --stdout --config-file test/e2e/fr-config-manager-pull-config/raw.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_D_config-file_V.protocol_V.resource frodo config-manager pull raw -D configManagerExportRawDir2 --config-file test/e2e/fr-config-manager-pull-config/raw.json -V.protocol 2.0 -V.resource 1.0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_stdout_config-file_V.protocol_V.resource frodo config-manager pull raw --stdout --config-file test/e2e/fr-config-manager-pull-config/raw.json -V.protocol 2.0 -V.resource 1.0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_config-file_stdout_path_V.protocol_V.resource frodo config-manager pull raw --config-file test/e2e/fr-config-manager-pull-config/raw.json --stdout --path /environment/release -V.protocol 2.0 -V.resource 1.0
*/
import { getEnv, testExport, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);

const configFile = 'test/e2e/fr-config-manager-pull-config/raw.json';

// Each FRODO_TEST_NAME below pins the recording identity of its command (the args id it was recorded under, or a fixed label); test/unit/E2eRecordingIdentity.test.js checks every pin.
describe('frodo config-manager pull raw', () => {
    test('"frodo config-manager pull raw -D configManagerExportRawDir0 --config-file test/e2e/fr-config-manager-pull-config/raw.json": should export all the configs in the provided json file in fr-config manager style.', async () => {
        const dirName = 'configManagerExportRawDir0';
        const CMD = `frodo config-manager pull raw -D ${dirName} --config-file ${configFile}`;
        await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_D_f' } }, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull raw --config-file test/e2e/fr-config-manager-pull-config/raw.json --path /environment/release -D configManagerExportRawDir1": should export the configuration at the specified API path in fr-config-manager format.', async () => {
        const dirName = 'configManagerExportRawDir1';
        const CMD = `frodo config-manager pull raw --config-file test/e2e/fr-config-manager-pull-config/raw.json --path /environment/release -D ${dirName}`;
        await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_config-file_path_D' } }, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull raw --stdout --config-file test/e2e/fr-config-manager-pull-config/raw.json": should output the configurations listed in the JSON file to stdout in fr-config-manager format.', async () => {
        const CMD = `frodo config-manager pull raw --stdout --config-file ${configFile}`;
        await testSuccess(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_stdout_config-file' } });
    });
    test('"frodo config-manager pull raw -D configManagerExportRawDir2 --config-file test/e2e/fr-config-manager-pull-config/raw.json -V.protocol 2.0 -V.resource 1.0": should export all configurations listed in the JSON file in fr-config-manager format, preserving any push API versions.', async () => {
        const dirName = 'configManagerExportRawDir2';
        const CMD = `frodo config-manager pull raw -D ${dirName} --config-file ${configFile} -V.protocol 2.0 -V.resource 1.0`;
        await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_D_config-file_V.protocol_V.resource' } }, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull raw --stdout --config-file test/e2e/fr-config-manager-pull-config/raw.json -V.protocol 2.0 -V.resource 1.0": should output all configurations listed in the JSON file to stdout in fr-config-manager format, preserving any push API versions.', async () => {
        const CMD = `frodo config-manager pull raw --stdout --config-file ${configFile} -V.protocol 2.0 -V.resource 1.0`;
        await testSuccess(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_stdout_config-file_V.protocol_V.resource' } });
    });
    test('"frodo config-manager pull raw --config-file test/e2e/fr-config-manager-pull-config/raw.json --stdout --path /environment/release -V.protocol 2.0 -V.resource 1.0": should output the configuration at the specified API path to stdout in fr-config-manager format.', async () => {
        const CMD = `frodo config-manager pull raw --config-file test/e2e/fr-config-manager-pull-config/raw.json --stdout --path /environment/release -V.protocol 2.0 -V.resource 1.0`;
        await testSuccess(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_config-file_stdout_path_V.protocol_V.resource' } });
    });
});
