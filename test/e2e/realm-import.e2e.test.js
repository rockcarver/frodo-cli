/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm import -i L2JyYXZv -f test/e2e/exports/all/allRealms.realm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm import --realm-id L2JyYXZv --file test/e2e/exports/all/allRealms.realm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm import -n bravo -f test/e2e/exports/all/allRealms.realm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm import --realm-name bravo --file test/e2e/exports/all/allRealms.realm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm import -f test/e2e/exports/all/allRealms.realm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm import -af test/e2e/exports/all/allRealms.realm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm import --all --file test/e2e/exports/all/allRealms.realm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm import -AD test/e2e/exports/all-separate/cloud/global/realm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo realm import --all-separate --directory test/e2e/exports/all-separate/cloud/global/realm
// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo realm import -i L2JyYXZv -f test/e2e/exports/all/allRealms.realm.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo realm import --realm-id L2JyYXZv --file test/e2e/exports/all/allRealms.realm.json --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo realm import -n bravo -f test/e2e/exports/all/allRealms.realm.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo realm import --realm-name bravo --file test/e2e/exports/all/allRealms.realm.json --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo realm import -f test/e2e/exports/all/allRealms.realm.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo realm import -af test/e2e/exports/all/allRealms.realm.json -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo realm import --all --file test/e2e/exports/all/allRealms.realm.json --type classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo realm import -AD test/e2e/exports/all-separate/classic/global/realm -m classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo realm import --all-separate --directory test/e2e/exports/all-separate/classic/global/realm --type classic
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

const allDirectory = "test/e2e/exports/all";
const allAlphaRealmsFileName = "allRealms.realm.json";
const allAlphaRealmsExport = `${allDirectory}/${allAlphaRealmsFileName}`;
const allSeparateRealmsDirectory = `test/e2e/exports/all-separate/cloud/global/realm`;
const allSeparateClassicRealmsDirectory = `test/e2e/exports/all-separate/classic/global/realm`;

describe('frodo realm import', () => {
    // Cloud currently doesn't support importing realms. At the moment, 401 errors are received, and there are no permissions that can be granted to service accounts to allow it.
    // In the future, if this does get supported, these tests may be uncommented.

    /*test(`"frodo realm import -i L2JyYXZv -f ${allAlphaRealmsExport}": should import the realm with the id "L2JyYXZv" from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import -i L2JyYXZv -f ${allAlphaRealmsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import --realm-id L2JyYXZv --file ${allAlphaRealmsExport}": should import the realm with the id "L2JyYXZv" from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import --realm-id L2JyYXZv --file ${allAlphaRealmsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import -n bravo -f ${allAlphaRealmsExport}": should import the realm with the name "bravo" from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import -n bravo -f ${allAlphaRealmsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import --realm-name bravo --file ${allAlphaRealmsExport}": should import the realm with the name "bravo" from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import --realm-name bravo --file ${allAlphaRealmsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import -f ${allAlphaRealmsExport}": should import the first realm from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import -f ${allAlphaRealmsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import -af ${allAlphaRealmsExport}": should import all realms from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import -af ${allAlphaRealmsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import --all --file ${allAlphaRealmsExport}": should import all realms from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import --all --file ${allAlphaRealmsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import -AD ${allSeparateRealmsDirectory}": should import all realms from the ${allSeparateRealmsDirectory} directory"`, async () => {
        const CMD = `frodo realm import -AD ${allSeparateRealmsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import --all-separate --directory ${allSeparateRealmsDirectory}": should import all realms from the ${allSeparateRealmsDirectory} directory"`, async () => {
        const CMD = `frodo realm import --all-separate --directory ${allSeparateRealmsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });*/

    test(`"frodo realm import -i L2JyYXZv -f ${allAlphaRealmsExport} -m classic": should import the realm with the id "L2JyYXZv" from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import -i L2JyYXZv -f ${allAlphaRealmsExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import --realm-id L2JyYXZv --file ${allAlphaRealmsExport} --type classic": should import the realm with the id "L2JyYXZv" from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import --realm-id L2JyYXZv --file ${allAlphaRealmsExport} --type classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import -n bravo -f ${allAlphaRealmsExport} -m classic": should import the realm with the name "bravo" from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import -n bravo -f ${allAlphaRealmsExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import --realm-name bravo --file ${allAlphaRealmsExport} --type classic": should import the realm with the name "bravo" from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import --realm-name bravo --file ${allAlphaRealmsExport} --type classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import -f ${allAlphaRealmsExport} -m classic": should import the first realm from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import -f ${allAlphaRealmsExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import -af ${allAlphaRealmsExport} -m classic": should import all realms from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import -af ${allAlphaRealmsExport} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import --all --file ${allAlphaRealmsExport} --type classic": should import all realms from the file "${allAlphaRealmsExport}"`, async () => {
        const CMD = `frodo realm import --all --file ${allAlphaRealmsExport} --type classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import -AD ${allSeparateClassicRealmsDirectory} -m classic": should import all realms from the ${allSeparateClassicRealmsDirectory} directory"`, async () => {
        const CMD = `frodo realm import -AD ${allSeparateClassicRealmsDirectory} -m classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo realm import --all-separate --directory ${allSeparateClassicRealmsDirectory} --type classic": should import all realms from the ${allSeparateClassicRealmsDirectory} directory"`, async () => {
        const CMD = `frodo realm import --all-separate --directory ${allSeparateClassicRealmsDirectory} --type classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

});
