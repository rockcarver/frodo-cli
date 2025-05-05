/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
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
 *    $ FRODO_MOCK=record frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
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
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -i sync/managedAlpha_application_managedBravo_application -f test/e2e/exports/all/allMappings.mapping.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --no-deps --mapping-id mapping/managedBravo_group_managedBravo_group --file allMappings.mapping.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -f test/e2e/exports/all/allMappings.mapping.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --no-deps --file allMappings.mapping.json --directory test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -af test/e2e/exports/all/allMappings.mapping.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --all --no-deps --file allMappings.mapping.json --directory test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -AD test/e2e/exports/all-separate/cloud/global/idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --all-separate --no-deps --directory test/e2e/exports/all-separate/cloud/global/idm

// IDM
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo mapping import -af test/e2e/exports/all/idm/allMappings.mapping.json -m idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo mapping import -AD test/e2e/exports/all-separate/idm/global/sync -m idm
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c , idm_connection as ic} from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);
const idmEnv = getEnv(ic);

const allDirectory = "test/e2e/exports/all";
const allMappingsFileName = "allMappings.mapping.json";
const allMappingsExport = `${allDirectory}/${allMappingsFileName}`;
const allSeparateMappingsDirectory = `test/e2e/exports/all-separate/cloud/global/idm`;

describe('frodo mapping import', () => {
    test(`"frodo mapping import -i sync/managedAlpha_application_managedBravo_application -f ${allMappingsExport}": should import the mapping with the id "sync/managedAlpha_application_managedBravo_application" from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import -i sync/managedAlpha_application_managedBravo_application -f ${allMappingsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo mapping import --no-deps --mapping-id mapping/managedBravo_group_managedBravo_group --file ${allMappingsFileName} -D ${allDirectory}": should import the mapping with the id "mapping/managedBravo_group_managedBravo_group" from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import --no-deps --mapping-id mapping/managedBravo_group_managedBravo_group --file ${allMappingsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo mapping import -f ${allMappingsExport}": should import the first mapping from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import -f ${allMappingsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo mapping import --no-deps --file ${allMappingsFileName} --directory ${allDirectory}": should import the first mapping from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import --no-deps --file ${allMappingsFileName} --directory ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo mapping import -af ${allMappingsExport}": should import all mappings from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import -af ${allMappingsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo mapping import --all --no-deps --file ${allMappingsFileName} --directory ${allDirectory}": should import all mappings from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import --all --no-deps --file ${allMappingsFileName} --directory ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo mapping import -AD ${allSeparateMappingsDirectory}": should import all mappings from the ${allSeparateMappingsDirectory} directory"`, async () => {
        const CMD = `frodo mapping import -AD ${allSeparateMappingsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo mapping import --all-separate --no-deps --directory ${allSeparateMappingsDirectory}": should import all mappings from the ${allSeparateMappingsDirectory} directory"`, async () => {
        const CMD = `frodo mapping import --all-separate --no-deps --directory ${allSeparateMappingsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    test(`"frodo mapping import -af test/e2e/exports/all/idm/allMappings.mapping.json -m idm": should import all IDM mappings from file."`, async () => {
        const CMD = `frodo mapping import -af test/e2e/exports/all/idm/allMappings.mapping.json -m idm`;
        const { stdout } = await exec(CMD, idmEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo mapping import -AD test/e2e/exports/all-separate/idm/global/sync -m idm": should import all IDM mappings from the directory"`, async () => {
        const CMD = `frodo mapping import -AD test/e2e/exports/all-separate/idm/global/sync -m idm`;
        const { stdout } = await exec(CMD, idmEnv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
});
