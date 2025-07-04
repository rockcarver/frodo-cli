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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import -n URL -f test/e2e/exports/all/allAlphaResourceTypes.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import --type-name URL --file test/e2e/exports/all/allAlphaResourceTypes.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import -n URL -f allAlphaResourceTypes.resourcetype.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f test/e2e/exports/all/allAlphaResourceTypes.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2 --file test/e2e/exports/all/allAlphaResourceTypes.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f allAlphaResourceTypes.resourcetype.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import -f test/e2e/exports/all/allAlphaResourceTypes.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import --file test/e2e/exports/all/allAlphaResourceTypes.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import -f allAlphaResourceTypes.resourcetype.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import -af test/e2e/exports/all/allAlphaResourceTypes.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import --all --file test/e2e/exports/all/allAlphaResourceTypes.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import -af allAlphaResourceTypes.resourcetype.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/resourcetype
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type import --all-separate --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/resourcetype
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);


const allDirectory = "test/e2e/exports/all";
const allAlphaResourceTypesFileName = "allAlphaResourceTypes.resourcetype.authz.json";
const allAlphaResourceTypesExport = `${allDirectory}/${allAlphaResourceTypesFileName}`;
const allSeparateResourceTypesDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/resourcetype`;

describe('frodo authz type import', () => {
    test(`"frodo authz type import -n URL -f ${allAlphaResourceTypesExport}": should import the resource type with the name "URL" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -n URL -f ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import --type-name URL --file ${allAlphaResourceTypesExport}": should import the resource with the name "URL" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import --type-name URL --file ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import -n URL -f ${allAlphaResourceTypesFileName} -D ${allDirectory}": should import the resource type with the name "URL" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -n URL -f ${allAlphaResourceTypesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f ${allAlphaResourceTypesExport}": should import the resource type with the id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2 --file ${allAlphaResourceTypesExport}": should import the resource type with the id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2 --file ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f ${allAlphaResourceTypesFileName} -D ${allDirectory}": should import the resource type with the id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f ${allAlphaResourceTypesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });


    test(`"frodo authz type import -f ${allAlphaResourceTypesExport}": should import the first resource type from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -f ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import --file ${allAlphaResourceTypesExport}": should import the first resource type from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import --file ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import -f ${allAlphaResourceTypesFileName} -D ${allDirectory}": should import the first resource type from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -f ${allAlphaResourceTypesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import -af ${allAlphaResourceTypesExport}": should import all resource types from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -af ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import --all --file ${allAlphaResourceTypesExport}": should import all resource types from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import --all --file ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import -af ${allAlphaResourceTypesFileName} -D ${allDirectory}": should import all resource types from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -af ${allAlphaResourceTypesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import -AD ${allSeparateResourceTypesDirectory}": should import all resource types from the ${allSeparateResourceTypesDirectory} directory"`, async () => {
        const CMD = `frodo authz type import -AD ${allSeparateResourceTypesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo authz type import --all-separate --directory ${allSeparateResourceTypesDirectory}": should import all resource types from the ${allSeparateResourceTypesDirectory} directory"`, async () => {
        const CMD = `frodo authz type import --all-separate --directory ${allSeparateResourceTypesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

});
