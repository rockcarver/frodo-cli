/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script import -Fn "Test Groovy Script" -f test/e2e/exports/all/forgeops/allScripts.script.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script import --no-deps --script-name "Test Groovy Script" --file test/e2e/exports/all/forgeops/allScripts.script.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script import --force-update --script-id 3d27b6d3-0f41-410a-9975-2e9df43d885e --file test/e2e/exports/all/forgeops/allScripts.script.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script import --no-deps -i 3d27b6d3-0f41-410a-9975-2e9df43d885e -f test/e2e/exports/all/forgeops/allScripts.script.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script import -dFf test/e2e/exports/all/forgeops/allScripts.script.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script import --no-deps --file test/e2e/exports/all/forgeops/allScripts.script.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script import -FAD test/e2e/exports/all-separate/forgeops/realm/root/script
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script import --default --no-deps --all-separate --directory test/e2e/exports/all-separate/forgeops/realm/root/script
*/
import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allForgeopsDirectory = "test/e2e/exports/all/forgeops";
const allForgeopsRootScriptsFileName = "allScripts.script.json";
const allForgeopsRootScriptsExport = `${allForgeopsDirectory}/${allForgeopsRootScriptsFileName}`;
const allForgeopsFootSeparateScriptsDirectory = `test/e2e/exports/all-separate/forgeops/realm/root/script`;

describe('frodo script import', () => {
    test(`"frodo script import -Fn "Test Groovy Script" -f ${allForgeopsRootScriptsExport}": should import the script with the name "Test Groovy Script" from the file "${allForgeopsRootScriptsExport}"`, async () => {
        const CMD = `frodo script import -Fn "Test Groovy Script" -f ${allForgeopsRootScriptsExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo script import --no-deps --script-name "Test Groovy Script" --file ${allForgeopsRootScriptsExport}": should not import the script with the name "Test Groovy Script" from the file "${allForgeopsRootScriptsExport}" when no changes are made`, async () => {
        const CMD = `frodo script import --no-deps --script-name "Test Groovy Script" --file ${allForgeopsRootScriptsExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo script import --force-update --script-id 3d27b6d3-0f41-410a-9975-2e9df43d885e --file ${allForgeopsRootScriptsExport}": should import the script with the id "3d27b6d3-0f41-410a-9975-2e9df43d885e" from the file "${allForgeopsRootScriptsExport}"`, async () => {
        const CMD = `frodo script import --force-update --script-id 3d27b6d3-0f41-410a-9975-2e9df43d885e --file ${allForgeopsRootScriptsExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo script import --no-deps -i 3d27b6d3-0f41-410a-9975-2e9df43d885e -f ${allForgeopsRootScriptsExport}": should not import the script with the id "3d27b6d3-0f41-410a-9975-2e9df43d885e" from the file "${allForgeopsRootScriptsExport}" when no changes are made`, async () => {
        const CMD = `frodo script import --no-deps -i 3d27b6d3-0f41-410a-9975-2e9df43d885e -f ${allForgeopsRootScriptsExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo script import -dFf ${allForgeopsRootScriptsExport}": should import the all scripts including defaults from the file "${allForgeopsRootScriptsExport}"`, async () => {
        const CMD = `frodo script import -dFf ${allForgeopsRootScriptsExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo script import --no-deps --file ${allForgeopsRootScriptsExport}": should not import default or unchanged scripts from the file "${allForgeopsRootScriptsExport}"`, async () => {
        const CMD = `frodo script import --no-deps --file ${allForgeopsRootScriptsExport}`;
        await testSuccess(CMD, env);
    });

    // TODO: Skipping for now because the snapshot is inconsistent for this. Most of the time it's the same, but once in a while the order of the scripts being updated changes (probably due to the watch function and how it's reading the files)
    test.skip(`"frodo script import -FAD ${allForgeopsFootSeparateScriptsDirectory}": should import all scripts from the ${allForgeopsFootSeparateScriptsDirectory} directory`, async () => {
        const CMD = `frodo script import -FAD ${allForgeopsFootSeparateScriptsDirectory}`;
        await testSuccess(CMD, env);
    });

    // TODO: Skipping for now because the snapshot is inconsistent for this. Most of the time it's the same, but once in a while the order of the scripts being updated changes (probably due to the watch function and how it's reading the files)
    test.skip(`"frodo script import --default --no-deps --all-separate --directory ${allForgeopsFootSeparateScriptsDirectory}": should not import all unchanged scripts, including defaults, from the ${allForgeopsFootSeparateScriptsDirectory} directory`, async () => {
        const CMD = `frodo script import --default --no-deps --all-separate --directory ${allForgeopsFootSeparateScriptsDirectory}`;
        await testSuccess(CMD, env);
    });
});
