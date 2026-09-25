/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -i 'test-policy-set' -f test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --set-id 'test-policy-set' --file test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -i 'test-policy-set' -f allAlphaPolicySets.policyset.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -f test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --file test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -f allAlphaPolicySets.policyset.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -af test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --all --file test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -af allAlphaPolicySets.policyset.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/policyset
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --all-separate --no-deps --prereqs --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/policyset
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaPolicySetsFileName = "allAlphaPolicySets.policyset.authz.json";
const allAlphaPolicySetsExport = `${allDirectory}/${allAlphaPolicySetsFileName}`;
const allSeparatePolicySetsDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/policyset`;

describe('frodo authz set import', () => {
    test(`"frodo authz set import -i 'test-policy-set' -f ${allAlphaPolicySetsExport}": should import the policy set with the id "test-policy-set" from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -i 'test-policy-set' -f ${allAlphaPolicySetsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz set import --set-id 'test-policy-set' --file ${allAlphaPolicySetsExport} --no-deps --prereqs": should import the policy set with the id "test-policy-set" from the file "${allAlphaPolicySetsExport}" with no dependencies`, async () => {
        const CMD = `frodo authz set import --set-id 'test-policy-set' --file ${allAlphaPolicySetsExport} --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz set import -i 'test-policy-set' -f ${allAlphaPolicySetsFileName} -D ${allDirectory}": should import the policy set with the id "test-policy-set" from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -i 'test-policy-set' -f ${allAlphaPolicySetsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz set import -f ${allAlphaPolicySetsExport}": should import the first policy set from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -f ${allAlphaPolicySetsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz set import --file ${allAlphaPolicySetsExport} --no-deps --prereqs": should import the first policy set from the file "${allAlphaPolicySetsExport}" with no dependencies`, async () => {
        const CMD = `frodo authz set import --file ${allAlphaPolicySetsExport} --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz set import -f ${allAlphaPolicySetsFileName} -D ${allDirectory}": should import the first policy set from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -f ${allAlphaPolicySetsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz set import -af ${allAlphaPolicySetsExport}": should import all policy sets from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -af ${allAlphaPolicySetsExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz set import --all --file ${allAlphaPolicySetsExport} --no-deps --prereqs": should import all policy sets from the file "${allAlphaPolicySetsExport}" with no dependencies`, async () => {
        const CMD = `frodo authz set import --all --file ${allAlphaPolicySetsExport} --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz set import -af ${allAlphaPolicySetsFileName} -D ${allDirectory}": should import all policy sets from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -af ${allAlphaPolicySetsFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz set import -AD ${allSeparatePolicySetsDirectory}": should import all policy sets from the ${allSeparatePolicySetsDirectory} directory"`, async () => {
        const CMD = `frodo authz set import -AD ${allSeparatePolicySetsDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz set import --all-separate --no-deps --prereqs --directory ${allSeparatePolicySetsDirectory}": should fail when prerequisite resource type definitions are not included in the separate export files`, async () => {
        const CMD = `frodo authz set import --all-separate --no-deps --prereqs --directory ${allSeparatePolicySetsDirectory}`;
        try {
            await exec(CMD, env);
            fail("Command should've failed");
        } catch (e) {
            expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });

});
