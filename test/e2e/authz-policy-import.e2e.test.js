/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -Fi 'Test Policy' -f test/e2e/exports/all/allAlphaPolicies.policy.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --force-update --policy-id 'Test Policy' --file test/e2e/exports/all/allAlphaPolicies.policy.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -i 'Test Policy' -f allAlphaPolicies.policy.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -Ff test/e2e/exports/all/allAlphaPolicies.policy.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --force-update --file test/e2e/exports/all/allAlphaPolicies.policy.authz.json --set-id test-policy-set --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -f allAlphaPolicies.policy.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -Faf test/e2e/exports/all/allAlphaPolicies.policy.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --force-update --all --file test/e2e/exports/all/allAlphaPolicies.policy.authz.json --set-id test-policy-set --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -af allAlphaPolicies.policy.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import -FAD test/e2e/exports/all-separate/cloud/realm/root-alpha/policy
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --force-update --all-separate --set-id test-policy-set --no-deps --prereqs --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/policy
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --no-deps -FAD test/e2e/exports/all-separate/cloud/realm/root-alpha/policy
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy import --all-separate --set-id test-policy-set --no-deps --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/policy
*/
import {
    getEnv,
    testSuccess,
    testFail
} from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaPoliciesFileName = "allAlphaPolicies.policy.authz.json";
const allAlphaPoliciesExport = `${allDirectory}/${allAlphaPoliciesFileName}`;
const allSeparatePoliciesDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/policy`;

describe('frodo authz policy import', () => {
    test(`"frodo authz policy import -Fi 'Test Policy' -f ${allAlphaPoliciesExport}": should import the policy with the id "Test Policy" from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -Fi 'Test Policy' -f ${allAlphaPoliciesExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz policy import --force-update --policy-id 'Test Policy' --file ${allAlphaPoliciesExport} --no-deps --prereqs": should import the policy with the id "Test Policy" from the file "${allAlphaPoliciesExport}" with no dependencies`, async () => {
        const CMD = `frodo authz policy import --force-update --policy-id 'Test Policy' --file ${allAlphaPoliciesExport} --no-deps --prereqs`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz policy import -i 'Test Policy' -f ${allAlphaPoliciesFileName} -D ${allDirectory}": should not import the policy with the id "Test Policy" from the file "${allAlphaPoliciesExport}" when no changes are made`, async () => {
        const CMD = `frodo authz policy import -i 'Test Policy' -f ${allAlphaPoliciesFileName} -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz policy import -Ff ${allAlphaPoliciesExport}": should import the first policy from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -Ff ${allAlphaPoliciesExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz policy import --force-update --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs": should import the first policy from the file "${allAlphaPoliciesExport}" with no dependencies`, async () => {
        const CMD = `frodo authz policy import --force-update --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz policy import -f ${allAlphaPoliciesFileName} -D ${allDirectory}": should not import the first policy from the file "${allAlphaPoliciesExport}" when no changes are made`, async () => {
        const CMD = `frodo authz policy import -f ${allAlphaPoliciesFileName} -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz policy import -Faf ${allAlphaPoliciesExport}": should import all policies from the file "${allAlphaPoliciesExport}"`, async () => {
        const CMD = `frodo authz policy import -Faf ${allAlphaPoliciesExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz policy import --force-update --all --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs": should import all policies from the file "${allAlphaPoliciesExport}" with no dependencies`, async () => {
        const CMD = `frodo authz policy import --force-update --all --file ${allAlphaPoliciesExport} --set-id test-policy-set --no-deps --prereqs`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz policy import -af ${allAlphaPoliciesFileName} -D ${allDirectory}": should not import all policies from the file "${allAlphaPoliciesExport}" when no changes are made`, async () => {
        const CMD = `frodo authz policy import -af ${allAlphaPoliciesFileName} -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz policy import -FAD ${allSeparatePoliciesDirectory}": should fail when dependency definitions are not included in the separate export files`, async () => {
        const CMD = `frodo authz policy import -FAD ${allSeparatePoliciesDirectory}`;
        await testFail(CMD, env);
    });

    test(`"frodo authz policy import --force-update --all-separate --set-id test-policy-set --no-deps --prereqs --directory ${allSeparatePoliciesDirectory}": should fail when prerequisite definitions are not included in the separate export files`, async () => {
        const CMD = `frodo authz policy import --force-update --all-separate --set-id test-policy-set --no-deps --prereqs --directory ${allSeparatePoliciesDirectory}`;
        await testFail(CMD, env);
    });

    test(`"frodo authz policy import --no-deps -FAD ${allSeparatePoliciesDirectory}": should import all policies from the directory ${allSeparatePoliciesDirectory}`, async () => {
        const CMD = `frodo authz policy import --no-deps -FAD ${allSeparatePoliciesDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz policy import --all-separate --set-id test-policy-set --no-deps --directory ${allSeparatePoliciesDirectory}": should not import all policies for set test-policy-set from the directory ${allSeparatePoliciesDirectory} when no changes are made`, async () => {
        const CMD = `frodo authz policy import --all-separate --set-id test-policy-set --no-deps --directory ${allSeparatePoliciesDirectory}`;
        await testSuccess(CMD, env);
    });
});
