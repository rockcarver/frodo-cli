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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import -i script -D test/e2e/exports/all-separate/cloud/global/idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import -f test/e2e/exports/all-separate/cloud/global/idm/script.idm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import --entity-id script --file test/e2e/exports/all-separate/cloud/global/idm/script.idm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import -i script -e test/e2e/env/testEnvFile.env -f script.idm.json -D test/e2e/exports/all-separate/cloud/global/idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import -af test/e2e/exports/all/all.idm.json -e test/e2e/env/testEnvFile.env -E test/e2e/env/testEntitiesFile.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import --all --file all.idm.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import -AD test/e2e/exports/all-separate/cloud/global/idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import --all-separate --directory test/e2e/exports/all-separate/cloud/global/idm --env-file test/e2e/env/testEnvFile.env --entities-file test/e2e/env/testEntitiesFile.json

// IDM
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo idm import -af test/e2e/exports/all/idm/all.idm.json -m idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo idm import -AD test/e2e/exports/all-separate/idm/global/idm -m idm
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c , idm_connection as ic } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);
const idmenv = getEnv(ic) ;

const idmExportDirectory = "test/e2e/exports/all-separate/cloud/global/idm";
const idmScriptConfigFileName = "script.idm.json";
const idmScriptConfigExport = `${idmExportDirectory}/${idmScriptConfigFileName}`;
const allIdmExportDirectory = 'test/e2e/exports/all';
const allIdmExportFileName = 'all.idm.json';
const allIdmExport = `${allIdmExportDirectory}/${allIdmExportFileName}`;
const testEntitiesFile = 'test/e2e/env/testEntitiesFile.json';
const testEnvFile = 'test/e2e/env/testEnvFile.env';

describe('frodo idm import', () => {
    test(`"frodo idm import -i script -D ${idmExportDirectory}": should import the idm config with name 'script' from the directory ${idmExportDirectory}"`, async () => {
        const CMD = `frodo idm import -i script -D ${idmExportDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo idm import -f ${idmScriptConfigExport}": should import the idm config from the file named '${idmScriptConfigExport}'"`, async () => {
        const CMD = `frodo idm import -f ${idmScriptConfigExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo idm import --entity-id script --file ${idmScriptConfigExport}": should import the idm config with name 'script' from the file named '${idmScriptConfigExport}'"`, async () => {
        const CMD = `frodo idm import --entity-id script --file ${idmScriptConfigExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo idm import -i script -e ${testEnvFile} -f ${idmScriptConfigFileName} -D ${idmExportDirectory}": should import the idm config with name 'script' from the file named '${idmScriptConfigExport}'"`, async () => {
        const CMD = `frodo idm import -i script -e ${testEnvFile} -f ${idmScriptConfigFileName} -D ${idmExportDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo idm import -af ${allIdmExport} -e ${testEnvFile} -E ${testEntitiesFile}": Should import all configs from the file '${allIdmExport}' according to the env and entity files"`, async () => {
        const CMD = `frodo idm import -af ${allIdmExport} -e ${testEnvFile} -E ${testEntitiesFile}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo idm import --all --file ${allIdmExportFileName} -D ${allIdmExportDirectory}": Should import all configs from the file '${allIdmExportFileName}' in directory '${allIdmExportDirectory}'"`, async () => {
        const CMD = `frodo idm import --all --file ${allIdmExportFileName} -D ${allIdmExportDirectory}`;
        try {
            await exec(CMD, env);
            fail("Command should've failed");
        } catch (e) {
            expect(removeAnsiEscapeCodes(e.stderr)).toMatchSnapshot();
        }
    });

    test(`"frodo idm import -AD ${idmExportDirectory}": Should import all configs from the directory '${idmExportDirectory}'"`, async () => {
        const CMD = `frodo idm import -AD ${idmExportDirectory}`;
        try {
            await exec(CMD, env);
            fail("Command should've failed");
        } catch (e) {
            expect(removeAnsiEscapeCodes(e.stderr)).toMatchSnapshot();
        }
    });

    test(`"frodo idm import --all-separate --directory ${idmExportDirectory} --env-file ${testEnvFile} --entities-file ${testEntitiesFile}": Should import all configs from the directory '${idmExportDirectory}' according to the env and entity files"`, async () => {
        const CMD = `frodo idm import --all-separate --directory ${idmExportDirectory} --env-file ${testEnvFile} --entities-file ${testEntitiesFile}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    test(`"frodo idm import -af test/e2e/exports/all/idm/all.idm.json -m idm": Should import on prem idm config' according to the idmenv and entity files"`, async () => {
        const CMD = `frodo idm import -af test/e2e/exports/all/idm/all.idm.json -m idm`;
        const { stdout } = await exec(CMD, idmenv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    test(`"frodo idm import -AD test/e2e/exports/all-separate/idm/global/idm -m idm": Should import on prem idm config according to the idmenv and entity files"`, async () => {
        const CMD = `frodo idm import -AD test/e2e/exports/all-separate/idm/global/idm -m idm`;
        const { stdout } = await exec(CMD, idmenv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
});
