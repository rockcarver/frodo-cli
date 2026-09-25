/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -i sync/managedAlpha_application_managedBravo_application -f test/e2e/exports/all/allMappings.mapping.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --no-deps --mapping-id mapping/managedBravo_group_managedBravo_group --file allMappings.mapping.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -f test/e2e/exports/all/allMappings.mapping.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --no-deps --file allMappings.mapping.json --directory test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -af test/e2e/exports/all/allMappings.mapping.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --all --no-deps --file allMappings.mapping.json --directory test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import -AD test/e2e/exports/all-separate/cloud/global/idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping import --all-separate --no-deps --directory test/e2e/exports/all-separate/cloud/global/idm
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allMappingsFileName = "allMappings.mapping.json";
const allMappingsExport = `${allDirectory}/${allMappingsFileName}`;
const allSeparateMappingsDirectory = `test/e2e/exports/all-separate/cloud/global/idm`;

describe('frodo mapping import', () => {

    test(`"frodo mapping import -i sync/managedAlpha_application_managedBravo_application -f ${allMappingsExport}": should import the mapping with the id "sync/managedAlpha_application_managedBravo_application" from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import -i sync/managedAlpha_application_managedBravo_application -f ${allMappingsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo mapping import --no-deps --mapping-id mapping/managedBravo_group_managedBravo_group --file ${allMappingsFileName} -D ${allDirectory}": should import the mapping with the id "mapping/managedBravo_group_managedBravo_group" from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import --no-deps --mapping-id mapping/managedBravo_group_managedBravo_group --file ${allMappingsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo mapping import -f ${allMappingsExport}": should import the first mapping from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import -f ${allMappingsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo mapping import --no-deps --file ${allMappingsFileName} --directory ${allDirectory}": should import the first mapping from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import --no-deps --file ${allMappingsFileName} --directory ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo mapping import -af ${allMappingsExport}": should import all mappings from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import -af ${allMappingsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo mapping import --all --no-deps --file ${allMappingsFileName} --directory ${allDirectory}": should import all mappings from the file "${allMappingsExport}"`, async () => {
        const CMD = `frodo mapping import --all --no-deps --file ${allMappingsFileName} --directory ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo mapping import -AD ${allSeparateMappingsDirectory}": should import all mappings from the ${allSeparateMappingsDirectory} directory"`, async () => {
        const CMD = `frodo mapping import -AD ${allSeparateMappingsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo mapping import --all-separate --no-deps --directory ${allSeparateMappingsDirectory}": should import all mappings from the ${allSeparateMappingsDirectory} directory"`, async () => {
        const CMD = `frodo mapping import --all-separate --no-deps --directory ${allSeparateMappingsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
