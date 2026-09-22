/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 frodo conn save https://nightly.gcp.forgeops.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    If your command completes without errors and with the expected results,
 *    all the required mocks already exist and you are good to write your
 *    test and skip to step #4.
 *
 *    If, however, your command fails and you see errors like the one below,
 *    you know you need to record the mock responses first:
 *
 *    [Polly] [adapter:node-http] Recording for the following request is not found and `recordIfMissing` is `false`.
 *
 * 2. Record mock responses for your exact command.
 *    In mock record mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=record frodo conn save https://nightly.gcp.forgeops.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    Wait until you see all the Polly instances (mock recording adapters) have
 *    shutdown before you try to run step #1 again.
 *    Messages like these indicate mock recording adapters shutting down:
 *
 *    Polly instance 'conn/4' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 2s...
 *    Polly instance 'conn/save/3' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 1s...
 *    Polly instance 'conn/save/3' stopping in 2s...
 *    Polly instance 'conn/4' stopped.
 *    Polly instance 'conn/save/3' stopping in 1s...
 *    Polly instance 'conn/save/3' stopped.
 *
 * 3. Validate your freshly recorded mock responses are complete and working.
 *    Re-run the exact command you want to test in mock mode (see step #1).
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Commit both your test and your new recordings to the repository.
 *    Your tests are likely going to reside outside the frodo-lib project but
 *    the recordings must be committed to the frodo-lib project.
 */

/*
ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo script import -Fn "Test Groovy Script" -f test/e2e/exports/all/forgeops/allScripts.script.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo script import --no-deps --script-name "Test Groovy Script" --file test/e2e/exports/all/forgeops/allScripts.script.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo script import --force-update --script-id 3d27b6d3-0f41-410a-9975-2e9df43d885e --file test/e2e/exports/all/forgeops/allScripts.script.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo script import --no-deps -i 3d27b6d3-0f41-410a-9975-2e9df43d885e -f test/e2e/exports/all/forgeops/allScripts.script.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo script import -dFf test/e2e/exports/all/forgeops/allScripts.script.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo script import --no-deps --file test/e2e/exports/all/forgeops/allScripts.script.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo script import -FAD test/e2e/exports/all-separate/forgeops/realm/root/script -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo script import --default --no-deps --all-separate --directory test/e2e/exports/all-separate/forgeops/realm/root/script -m forgeops
*/
import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const allForgeopsDirectory = "test/e2e/exports/all/forgeops";
const allForgeopsRootScriptsFileName = "allScripts.script.json";
const allForgeopsRootScriptsExport = `${allForgeopsDirectory}/${allForgeopsRootScriptsFileName}`;
const allForgeopsFootSeparateScriptsDirectory = `test/e2e/exports/all-separate/forgeops/realm/root/script`;

describe('frodo script import', () => {
    test(`"frodo script import -Fn "Test Groovy Script" -f ${allForgeopsRootScriptsExport} -m forgeops": should import the script with the name "Test Groovy Script" from the file "${allForgeopsRootScriptsExport}"`, async () => {
        const CMD = `frodo script import -Fn "Test Groovy Script" -f ${allForgeopsRootScriptsExport} -m forgeops`;
        await testSuccess(CMD, env);
    });

    test(`"frodo script import --no-deps --script-name "Test Groovy Script" --file ${allForgeopsRootScriptsExport} -m forgeops": should not import the script with the name "Test Groovy Script" from the file "${allForgeopsRootScriptsExport}" when no changes are made`, async () => {
        const CMD = `frodo script import --no-deps --script-name "Test Groovy Script" --file ${allForgeopsRootScriptsExport} -m forgeops`;
        await testSuccess(CMD, env);
    });

    test(`"frodo script import --force-update --script-id 3d27b6d3-0f41-410a-9975-2e9df43d885e --file ${allForgeopsRootScriptsExport} -m forgeops": should import the script with the id "3d27b6d3-0f41-410a-9975-2e9df43d885e" from the file "${allForgeopsRootScriptsExport}"`, async () => {
        const CMD = `frodo script import --force-update --script-id 3d27b6d3-0f41-410a-9975-2e9df43d885e --file ${allForgeopsRootScriptsExport} -m forgeops`;
        await testSuccess(CMD, env);
    });

    test(`"frodo script import --no-deps -i 3d27b6d3-0f41-410a-9975-2e9df43d885e -f ${allForgeopsRootScriptsExport} -m forgeops": should not import the script with the id "3d27b6d3-0f41-410a-9975-2e9df43d885e" from the file "${allForgeopsRootScriptsExport}" when no changes are made`, async () => {
        const CMD = `frodo script import --no-deps -i 3d27b6d3-0f41-410a-9975-2e9df43d885e -f ${allForgeopsRootScriptsExport} -m forgeops`;
        await testSuccess(CMD, env);
    });

    test(`"frodo script import -dFf ${allForgeopsRootScriptsExport} -m forgeops": should import the all scripts including defaults from the file "${allForgeopsRootScriptsExport}"`, async () => {
        const CMD = `frodo script import -dFf ${allForgeopsRootScriptsExport} -m forgeops`;
        await testSuccess(CMD, env);
    });

    test(`"frodo script import --no-deps --file ${allForgeopsRootScriptsExport} -m forgeops": should not import default or unchanged scripts from the file "${allForgeopsRootScriptsExport}"`, async () => {
        const CMD = `frodo script import --no-deps --file ${allForgeopsRootScriptsExport} -m forgeops`;
        await testSuccess(CMD, env);
    });

    // TODO: Skipping for now because the snapshot is inconsistent for this. Most of the time it's the same, but once in a while the order of the scripts being updated changes (probably due to the watch function and how it's reading the files)
    test.skip(`"frodo script import -FAD ${allForgeopsFootSeparateScriptsDirectory} -m forgeops": should import all scripts from the ${allForgeopsFootSeparateScriptsDirectory} directory`, async () => {
        const CMD = `frodo script import -FAD ${allForgeopsFootSeparateScriptsDirectory} -m forgeops`;
        await testSuccess(CMD, env);
    });

    // TODO: Skipping for now because the snapshot is inconsistent for this. Most of the time it's the same, but once in a while the order of the scripts being updated changes (probably due to the watch function and how it's reading the files)
    test.skip(`"frodo script import --default --no-deps --all-separate --directory ${allForgeopsFootSeparateScriptsDirectory} -m forgeops": should not import all unchanged scripts, including defaults, from the ${allForgeopsFootSeparateScriptsDirectory} directory`, async () => {
        const CMD = `frodo script import --default --no-deps --all-separate --directory ${allForgeopsFootSeparateScriptsDirectory} -m forgeops`;
        await testSuccess(CMD, env);
    });
});
