/** See test/e2e/README.md for how to write and record e2e tests. */

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
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);


const allDirectory = "test/e2e/exports/all";
const allAlphaResourceTypesFileName = "allAlphaResourceTypes.resourcetype.authz.json";
const allAlphaResourceTypesExport = `${allDirectory}/${allAlphaResourceTypesFileName}`;
const allSeparateResourceTypesDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/resourcetype`;

describe('frodo authz type import', () => {
    test(`"frodo authz type import -n URL -f ${allAlphaResourceTypesExport}": should import the resource type with the name "URL" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -n URL -f ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import --type-name URL --file ${allAlphaResourceTypesExport}": should import the resource with the name "URL" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import --type-name URL --file ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import -n URL -f ${allAlphaResourceTypesFileName} -D ${allDirectory}": should import the resource type with the name "URL" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -n URL -f ${allAlphaResourceTypesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f ${allAlphaResourceTypesExport}": should import the resource type with the id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2 --file ${allAlphaResourceTypesExport}": should import the resource type with the id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2 --file ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f ${allAlphaResourceTypesFileName} -D ${allDirectory}": should import the resource type with the id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f ${allAlphaResourceTypesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });


    test(`"frodo authz type import -f ${allAlphaResourceTypesExport}": should import the first resource type from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -f ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import --file ${allAlphaResourceTypesExport}": should import the first resource type from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import --file ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import -f ${allAlphaResourceTypesFileName} -D ${allDirectory}": should import the first resource type from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -f ${allAlphaResourceTypesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import -af ${allAlphaResourceTypesExport}": should import all resource types from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -af ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import --all --file ${allAlphaResourceTypesExport}": should import all resource types from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import --all --file ${allAlphaResourceTypesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import -af ${allAlphaResourceTypesFileName} -D ${allDirectory}": should import all resource types from the file "${allAlphaResourceTypesExport}"`, async () => {
        const CMD = `frodo authz type import -af ${allAlphaResourceTypesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import -AD ${allSeparateResourceTypesDirectory}": should import all resource types from the ${allSeparateResourceTypesDirectory} directory"`, async () => {
        const CMD = `frodo authz type import -AD ${allSeparateResourceTypesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz type import --all-separate --directory ${allSeparateResourceTypesDirectory}": should import all resource types from the ${allSeparateResourceTypesDirectory} directory"`, async () => {
        const CMD = `frodo authz type import --all-separate --directory ${allSeparateResourceTypesDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

});
