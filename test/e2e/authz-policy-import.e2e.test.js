/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -i 'Test Policy' -f test/e2e/exports/all/allAlphaPolicies.policy.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --policy-id 'Test Policy' --file test/e2e/exports/all/allAlphaPolicies.policy.authz.json --set-id test-policy-set --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -i 'Test Policy' -f allAlphaPolicies.policy.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -f test/e2e/exports/all/allAlphaPolicies.policy.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --file test/e2e/exports/all/allAlphaPolicies.policy.authz.json --set-id test-policy-set --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -f allAlphaPolicies.policy.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -af test/e2e/exports/all/allAlphaPolicies.policy.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --all --file test/e2e/exports/all/allAlphaPolicies.policy.authz.json --set-id test-policy-set --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -af allAlphaPolicies.policy.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/policy
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --all-separate --set-id test-policy-set --no-deps --prereqs --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/policy
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaPoliciesFileName = "allAlphaPolicies.policy.authz.json";
const allAlphaPoliciesExport = `${allDirectory}/${allAlphaPoliciesFileName}`;
const allSeparatePoliciesSetsDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/policy`;

describe('frodo authz policy import', () => {
    test(`"frodo authz policy import -i 'Test Policy' -f ${allAlphaPoliciesExport}": should import the policy with the id "Test Policy" from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -i 'Test Policy' -f ${allAlphaPoliciesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz policy import --policy-id 'Test Policy' --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs": should import the policy with the id "Test Policy" from the file "${allAlphaPoliciesExport}" with no dependencies`, async () => {
        const CMD = `frodo authz policy import --policy-id 'Test Policy' --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz policy import -i 'Test Policy' -f ${allAlphaPoliciesFileName} -D ${allDirectory}": should import the policy with the id "Test Policy" from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -i 'Test Policy' -f ${allAlphaPoliciesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz policy import -f ${allAlphaPoliciesExport}": should import the first policy from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -f ${allAlphaPoliciesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz policy import --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs": should import the first policy from the file "${allAlphaPoliciesExport}" with no dependencies`, async () => {
        const CMD = `frodo authz policy import --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz policy import -f ${allAlphaPoliciesFileName} -D ${allDirectory}": should import the first policy from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -f ${allAlphaPoliciesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz policy import -af ${allAlphaPoliciesExport}": should import all policies from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -af ${allAlphaPoliciesExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz policy import --all --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs": should import all policies from the file "${allAlphaPoliciesExport}" with no dependencies`, async () => {
        const CMD = `frodo authz policy import --all --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz policy import -af ${allAlphaPoliciesFileName} -D ${allDirectory}": should import all policies from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -af ${allAlphaPoliciesFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo authz policy import -AD ${allSeparatePoliciesSetsDirectory}": should fail when dependency definitions are not included in the separate export files`, async () => {
        const CMD = `frodo authz policy import -AD ${allSeparatePoliciesSetsDirectory}`;
        try {
            await exec(CMD, env);
            fail("Command should've failed");
        } catch (e) {
            expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });

    test(`"frodo authz policy import --all-separate --set-id test-policy-set --no-deps --prereqs --directory ${allSeparatePoliciesSetsDirectory}": should fail when prerequisite definitions are not included in the separate export files`, async () => {
        const CMD = `frodo authz policy import --all-separate --set-id test-policy-set --no-deps --prereqs --directory ${allSeparatePoliciesSetsDirectory}`;
        try {
            await exec(CMD, env);
            fail("Command should've failed");
        } catch (e) {
            expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
        }
    });

});
