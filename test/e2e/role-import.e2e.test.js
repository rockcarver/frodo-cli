/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import -i ccb11ba1-333b-4197-95db-89bb08a2ab56 -f test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import --role-id ccb11ba1-333b-4197-95db-89bb08a2ab56 --file test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import -n test-internal-role -f test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import --role-name test-internal-role --file test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import -f test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import -af test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import --all --file test/e2e/exports/all/allInternalRoles.internalRole.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import -AD test/e2e/exports/all-separate/cloud/global/internalRole
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo role import --all-separate --directory test/e2e/exports/all-separate/cloud/global/internalRole
 */

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allRolesFileName = "allInternalRoles.internalRole.json";
const allRolesExport = `${allDirectory}/${allRolesFileName}`;
const allSeparateRolesDirectory = `test/e2e/exports/all-separate/cloud/global/internalRole`;

describe('frodo role import', () => {
    test(`"frodo role import -i ccb11ba1-333b-4197-95db-89bb08a2ab56 -f ${allRolesExport}": should import the role with the id "ccb11ba1-333b-4197-95db-89bb08a2ab56" from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import -i ccb11ba1-333b-4197-95db-89bb08a2ab56 -f ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
    
    test(`"frodo role import --role-id ccb11ba1-333b-4197-95db-89bb08a2ab56 --file ${allRolesExport}": should import the role with the id "ccb11ba1-333b-4197-95db-89bb08a2ab56" from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import --role-id ccb11ba1-333b-4197-95db-89bb08a2ab56 --file ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
    
    test(`"frodo role import -n test-internal-role -f ${allRolesExport}": should import the role with the name "test-internal-role" from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import -n test-internal-role -f ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
    
    test(`"frodo role import --role-name test-internal-role --file ${allRolesExport}": should import the role with the name "test-internal-role" from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import --role-name test-internal-role --file ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
    
    test(`"frodo role import -f ${allRolesExport}": should import the first role from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import -f ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
    
    test(`"frodo role import -af ${allRolesExport}": should import all roles from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import -af ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
    
    test(`"frodo role import --all --file ${allRolesExport}": should import all roles from the file "${allRolesExport}"`, async () => {
        const CMD = `frodo role import --all --file ${allRolesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
    
    test(`"frodo role import -AD ${allSeparateRolesDirectory}": should import all roles from the ${allSeparateRolesDirectory} directory"`, async () => {
        const CMD = `frodo role import -AD ${allSeparateRolesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
    
    test(`"frodo role import --all-separate --directory ${allSeparateRolesDirectory}": should import all roles from the ${allSeparateRolesDirectory} directory"`, async () => {
        const CMD = `frodo role import --all-separate --directory ${allSeparateRolesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
