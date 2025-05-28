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

/* Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import -i ccb11ba1-333b-4197-95db-89bb08a2ab56 -f test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import --role-id ccb11ba1-333b-4197-95db-89bb08a2ab56 --file test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import -n test-internal-role -f test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import --role-name test-internal-role --file test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import -f test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import -af test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import --all --file test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import -AD test/e2e/exports/all-separate/cloud/global/internalRole
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import --all-separate --directory test/e2e/exports/all-separate/cloud/global/internalRole
 
// IDM
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo role import -af test/e2e/exports/all/idm/allInternalRoles.internalRole.json -m idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo role import -AD test/e2e/exports/all-separate/idm/global/internalRole -m idm
*/

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c, idm_connection as ic } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);
const idmenv = getEnv(ic)

const allDirectory = "test/e2e/exports/all";
const allRolesFileName = "allInternalRoles.internalRole.json";
const allRolesExport = `${allDirectory}/${allRolesFileName}`;
const allSeparateRolesDirectory = `test/e2e/exports/all-separate/cloud/global/internalRole`;

describe('frodo role import', () => {
    test(`"frodo role import -i ccb11ba1-333b-4197-95db-89bb08a2ab56 -f ${allRolesExport}": should import the role with the id "ccb11ba1-333b-4197-95db-89bb08a2ab56" from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import -i ccb11ba1-333b-4197-95db-89bb08a2ab56 -f ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    
    test(`"frodo role import --role-id ccb11ba1-333b-4197-95db-89bb08a2ab56 --file ${allRolesExport}": should import the role with the id "ccb11ba1-333b-4197-95db-89bb08a2ab56" from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import --role-id ccb11ba1-333b-4197-95db-89bb08a2ab56 --file ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    
    test(`"frodo role import -n test-internal-role -f ${allRolesExport}": should import the role with the name "test-internal-role" from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import -n test-internal-role -f ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    
    test(`"frodo role import --role-name test-internal-role --file ${allRolesExport}": should import the role with the name "test-internal-role" from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import --role-name test-internal-role --file ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    
    test(`"frodo role import -f ${allRolesExport}": should import the first role from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import -f ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    
    test(`"frodo role import -af ${allRolesExport}": should import all roles from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import -af ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    
    test(`"frodo role import --all --file ${allRolesExport}": should import all roles from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import --all --file ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    
    test(`"frodo role import -AD ${allSeparateRolesDirectory}": should import all roles from the ${allSeparateRolesDirectory} directory"`, async () => {
        const CMD = `frodo role import -AD ${allSeparateRolesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    
    test(`"frodo role import --all-separate --directory ${allSeparateRolesDirectory}": should import all roles from the ${allSeparateRolesDirectory} directory"`, async () => {
        const CMD = `frodo role import --all-separate --directory ${allSeparateRolesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
    
    test(`"frodo role import -af test/e2e/exports/all/idm/allInternalRoles.internalRole.json -m idm": should import all on prem idm roles from one file"`, async () => {
        const CMD = `frodo role import -af test/e2e/exports/all/idm/allInternalRoles.internalRole.json -m idm `;
        const { stdout } = await exec(CMD, idmenv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo role import -AD test/e2e/exports/all-separate/idm/global/internalRole -m idm ": should import all on prem idm roles from the directory"`, async () => {
        const CMD = `frodo role import -AD test/e2e/exports/all-separate/idm/global/internalRole -m idm`;
        const { stdout } = await exec(CMD, idmenv);
        expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
});
