/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe --markdown
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -o 4.2.0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe --override-version 4.2.0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -i j00
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe --journey-id j00
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -i j00 --markdown
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -i j00 -o 4.2.0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe --file test/e2e/exports/all/allAlphaJourneys.journey.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json --markdown
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json -o 4.2.0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -F test1.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe --output-file test2.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -F test3.json --markdown
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo journey describe -F test4.json -o 4.2.0
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';
import fs from "fs";

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo journey describe', () => {
    test('"frodo journey describe": should describe all journeys', async () => {
        const CMD = `frodo journey describe`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe --markdown": should describe all journeys in markdown', async () => {
        const CMD = `frodo journey describe --markdown`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe -o 4.2.0": should describe all journeys and override version to 4.2.0', async () => {
        const CMD = `frodo journey describe -o 4.2.0`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe --override-version 4.2.0": should describe all journeys and override version to 4.2.0', async () => {
        const CMD = `frodo journey describe --override-version 4.2.0`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe -i j00": should describe the j00 journey', async () => {
        const CMD = `frodo journey describe -i j00`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe --journey-id j00": should describe the j00 journey', async () => {
        const CMD = `frodo journey describe --journey-id j00`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe -i j00 --markdown": should describe the j00 journey in markdown', async () => {
        const CMD = `frodo journey describe -i j00 --markdown`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe -i j00 -o 4.2.0": should describe the j00 journey and override version to 4.2.0', async () => {
        const CMD = `frodo journey describe -i j00 -o 4.2.0`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json": should describe all journeys from file', async () => {
        const CMD = `frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe --file test/e2e/exports/all/allAlphaJourneys.journey.json": should describe all journeys from file', async () => {
        const CMD = `frodo journey describe --file test/e2e/exports/all/allAlphaJourneys.journey.json`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json --markdown": should describe all journeys from file in markdown', async () => {
        const CMD = `frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json --markdown`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json -o 4.2.0": should describe all journeys from file and override version to 4.2.0', async () => {
        const CMD = `frodo journey describe -f test/e2e/exports/all/allAlphaJourneys.journey.json -o 4.2.0`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo journey describe -F test1.json": should describe all journeys and write output to test1.json file', async () => {
        const CMD = `frodo journey describe -F test1.json`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
        const data = fs.readFileSync("test1.json", 'utf8');
        expect(data).toMatchSnapshot();
        fs.unlinkSync("test1.json");
    });

    test('"frodo journey describe --output-file test2.json": should describe all journeys and write output to test2.json file', async () => {
        const CMD = `frodo journey describe --output-file test2.json`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
        const data = fs.readFileSync("test2.json", 'utf8');
        expect(data).toMatchSnapshot();
        fs.unlinkSync("test2.json");
    });

    test('"frodo journey describe -F test3.json --markdown": should describe all journeys and write output to test3.json file in markdown', async () => {
        const CMD = `frodo journey describe -F test3.json --markdown`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
        const data = fs.readFileSync("test3.json", 'utf8');
        expect(data).toMatchSnapshot();
        fs.unlinkSync("test3.json");
    });

    test('"frodo journey describe -F test4.json -o 4.2.0": should describe all journeys and write output to test4.json file and override version to 4.2.0', async () => {
        const CMD = `frodo journey describe -F test4.json -o 4.2.0`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
        const data = fs.readFileSync("test4.json", 'utf8');
        expect(data).toMatchSnapshot();
        fs.unlinkSync("test4.json");
    });
});
