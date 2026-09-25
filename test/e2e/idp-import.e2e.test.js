/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import -i google -f test/e2e/exports/all/allAlphaProviders.idp.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import --no-deps --idp-id google --file test/e2e/exports/all/allAlphaProviders.idp.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import -i google -f allAlphaProviders.idp.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import -f test/e2e/exports/all/allAlphaProviders.idp.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import --no-deps --file test/e2e/exports/all/allAlphaProviders.idp.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import -f allAlphaProviders.idp.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import -af test/e2e/exports/all/allAlphaProviders.idp.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import --all --no-deps --file test/e2e/exports/all/allAlphaProviders.idp.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import -af allAlphaProviders.idp.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/idp
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp import --all-separate --no-deps --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/idp
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaProvidersFileName = "allAlphaProviders.idp.json";
const allAlphaProvidersExport = `${allDirectory}/${allAlphaProvidersFileName}`;
const allSeparateProvidersDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/idp`;

describe('frodo idp import', () => {
    test(`"frodo idp import -i google -f ${allAlphaProvidersExport}": should import the idp with the id "google" from the file "${allAlphaProvidersExport}"`, async () => {
        const CMD = `frodo idp import -i google -f ${allAlphaProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo idp import --no-deps --idp-id google --file ${allAlphaProvidersExport}": should import the idp with the id "google" from the file "${allAlphaProvidersExport}"`, async () => {
        const CMD = `frodo idp import --no-deps --idp-id google --file ${allAlphaProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo idp import -i google -f ${allAlphaProvidersFileName} -D ${allDirectory}": should import the idp with the id "google" from the file "${allAlphaProvidersExport}"`, async () => {
        const CMD = `frodo idp import -i google -f ${allAlphaProvidersFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo idp import -f ${allAlphaProvidersExport}": should import the first idp from the file "${allAlphaProvidersExport}"`, async () => {
        const CMD = `frodo idp import -f ${allAlphaProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo idp import --no-deps --file ${allAlphaProvidersExport}": should import the first idp from the file "${allAlphaProvidersExport}"`, async () => {
        const CMD = `frodo idp import --no-deps --file ${allAlphaProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo idp import -f ${allAlphaProvidersFileName} -D ${allDirectory}": should import the first idp from the file "${allAlphaProvidersExport}"`, async () => {
        const CMD = `frodo idp import -f ${allAlphaProvidersFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo idp import -af ${allAlphaProvidersExport}": should import all idps from the file "${allAlphaProvidersExport}"`, async () => {
        const CMD = `frodo idp import -af ${allAlphaProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo idp import --all --no-deps --file ${allAlphaProvidersExport}": should import all idps from the file "${allAlphaProvidersExport}"`, async () => {
        const CMD = `frodo idp import --all --no-deps --file ${allAlphaProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo idp import -af ${allAlphaProvidersFileName} -D ${allDirectory}": should import all idps from the file "${allAlphaProvidersExport}"`, async () => {
        const CMD = `frodo idp import -af ${allAlphaProvidersFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo idp import -AD ${allSeparateProvidersDirectory}": should import all idps from the ${allSeparateProvidersDirectory} directory"`, async () => {
        const CMD = `frodo idp import -AD ${allSeparateProvidersDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo idp import --all-separate --no-deps --directory ${allSeparateProvidersDirectory}": should import all idps from the ${allSeparateProvidersDirectory} directory"`, async () => {
        const CMD = `frodo idp import --all-separate --no-deps --directory ${allSeparateProvidersDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

});
