/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -f test/e2e/exports/all-separate/cloud/realm/root-alpha/journey/FrodoTest.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --verbose -f test/e2e/exports/all-separate/cloud/realm/root-alpha/journey/FrodoTest.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -i j00 -f test/e2e/exports/all/allAlphaJourneys.journey.json --re-uuid
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -i j00 -f test/e2e/exports/all/allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --journey-id j00 -f test/e2e/exports/all/allAlphaJourneys.journey.json --no-deps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -i j00 -f allAlphaJourneys.journey.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --file test/e2e/exports/all/allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -f test/e2e/exports/all/allAlphaJourneys.journey.json --re-uuid
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --file test/e2e/exports/all/allAlphaJourneys.journey.json --no-deps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -f allAlphaJourneys.journey.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -af test/e2e/exports/all/allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -af test/e2e/exports/all/allAlphaJourneys.journey.json --re-uuid
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --all --file test/e2e/exports/all/allAlphaJourneys.journey.json --no-deps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -af allAlphaJourneys.journey.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/journey
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/journey --re-uuid
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey import --all-separate --no-deps --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/journey
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaJourneysFileName = "allAlphaJourneys.journey.json";
const allAlphaJourneysExport = `${allDirectory}/${allAlphaJourneysFileName}`;
const allSeparateJourneysDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/journey`;
const allSeparateLegacyJourneysDirectory = `test/e2e/exports/all-separate-legacy/cloud/realm/root-alpha/journey`;

describe('frodo journey import', () => {
    test(`"frodo journey import -f ${allSeparateJourneysDirectory}/FrodoTest.journey.json": should import the journey in file "${allSeparateJourneysDirectory}/FrodoTest.journey.json"`, async () => {
        const CMD = `frodo journey import -f ${allSeparateJourneysDirectory}/FrodoTest.journey.json`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import --verbose -f ${allSeparateJourneysDirectory}/FrodoTest.journey.json": should import the journey in file "${allSeparateJourneysDirectory}/FrodoTest.journey.json"`, async () => {
        const CMD = `frodo journey import --verbose -f ${allSeparateJourneysDirectory}/FrodoTest.journey.json`;
        const { stdout, stderr } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
        expect(normalizeSnapshotText(stderr)).toMatchSnapshot()
    });

    test.skip(`"frodo journey import -i j00 -f ${allAlphaJourneysExport} --re-uuid": should import the journey with the id "j00" from the file "${allAlphaJourneysExport}" with new uuids`, async () => {
        const CMD = `frodo journey import -i j00 -f ${allAlphaJourneysExport} --re-uuid`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import --journey-id j00 -f ${allAlphaJourneysExport} --no-deps": should import the journey with the id "j00" from the file "${allAlphaJourneysExport}" with no deps`, async () => {
        const CMD = `frodo journey import --journey-id j00 -f ${allAlphaJourneysExport} --no-deps`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import -i j00 -f ${allAlphaJourneysFileName} -D ${allDirectory}": should import the journey with the id "j00" from the file "${allAlphaJourneysExport}"`, async () => {
        const CMD = `frodo journey import -i j00 -f ${allAlphaJourneysFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import --file ${allAlphaJourneysExport}": should import the first journey from the file "${allAlphaJourneysExport}"`, async () => {
        const CMD = `frodo journey import --file ${allAlphaJourneysExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test.skip(`"frodo journey import -f ${allAlphaJourneysExport} --re-uuid": should import the first journey from the file "${allAlphaJourneysExport}" with new uuids`, async () => {
        const CMD = `frodo journey import -f ${allAlphaJourneysExport} --re-uuid`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import --file ${allAlphaJourneysExport} --no-deps": should import the first journey from the file"${allAlphaJourneysExport}" with no deps`, async () => {
        const CMD = `frodo journey import --file ${allAlphaJourneysExport} --no-deps`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import -f ${allAlphaJourneysFileName} -D ${allDirectory}": should import the first journey from the file "${allAlphaJourneysExport}"`, async () => {
        const CMD = `frodo journey import -f ${allAlphaJourneysFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import -af ${allAlphaJourneysExport}": should import all journeys from the file "${allAlphaJourneysExport}"`, async () => {
        const CMD = `frodo journey import -af ${allAlphaJourneysExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test.skip(`"frodo journey import -af ${allAlphaJourneysExport} --re-uuid": should import all journeys from the file "${allAlphaJourneysExport}" with new uuids`, async () => {
        const CMD = `frodo journey import -af ${allAlphaJourneysExport} --re-uuid`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import --all --file ${allAlphaJourneysExport} --no-deps": should import all journeys from the file"${allAlphaJourneysExport}" with no deps`, async () => {
        const CMD = `frodo journey import --all --file ${allAlphaJourneysExport} --no-deps`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import -af ${allAlphaJourneysFileName} -D ${allDirectory}": should import all journeys from the file "${allAlphaJourneysExport}"`, async () => {
        const CMD = `frodo journey import -af ${allAlphaJourneysFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import -AD ${allSeparateJourneysDirectory}": should import all journeys from the ${allSeparateJourneysDirectory} directory"`, async () => {
        const CMD = `frodo journey import -AD ${allSeparateJourneysDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test.skip(`"frodo journey import -AD ${allSeparateJourneysDirectory} --re-uuid": should import all journeys from the ${allSeparateJourneysDirectory} directory with new uuids`, async () => {
        const CMD = `frodo journey import -AD ${allSeparateJourneysDirectory} --re-uuid`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import --all-separate --no-deps --directory ${allSeparateJourneysDirectory}": should import all journeys from the ${allSeparateJourneysDirectory} directory with no deps`, async () => {
        const CMD = `frodo journey import --all-separate --no-deps --directory ${allSeparateJourneysDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo journey import --all-separate --no-deps --directory ${allSeparateLegacyJourneysDirectory}": should not fail with null/undefined object conversion when reading legacy single-tree files`, async () => {
        const CMD = `frodo journey import --all-separate --no-deps --directory ${allSeparateLegacyJourneysDirectory}`;
        let output = '';
        try {
            const { stdout, stderr } = await exec(CMD, env);
            output = `${stdout}\n${stderr}`;
        } catch (error) {
            output = `${error.stdout || ''}\n${error.stderr || ''}`;
        }
        expect(output).not.toContain('Cannot convert undefined or null to object');
        expect(output).toContain('Importing all journeys from separate files in current directory...');
    });
});
