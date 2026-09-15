/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -Fi 'test-policy-set' -f test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --force-update --set-id 'test-policy-set' --file test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -i 'test-policy-set' -f allAlphaPolicySets.policyset.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -Ff test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --force-update --file test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -f allAlphaPolicySets.policyset.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -Faf test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --force-update --all --file test/e2e/exports/all/allAlphaPolicySets.policyset.authz.json --no-deps --prereqs
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -af allAlphaPolicySets.policyset.authz.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import -FAD test/e2e/exports/all-separate/cloud/realm/root-alpha/policyset
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --all-separate --no-deps --prereqs --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/policyset
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz set import --all-separate --no-deps --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/policyset
*/
import { getEnv, testSuccess, testFail } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaPolicySetsFileName = "allAlphaPolicySets.policyset.authz.json";
const allAlphaPolicySetsExport = `${allDirectory}/${allAlphaPolicySetsFileName}`;
const allSeparatePolicySetsDirectory = `test/e2e/exports/all-separate/cloud/realm/root-alpha/policyset`;

describe('frodo authz set import', () => {
    test(`"frodo authz set import -Fi 'test-policy-set' -f ${allAlphaPolicySetsExport}": should import the policy set with the id "test-policy-set" from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -Fi 'test-policy-set' -f ${allAlphaPolicySetsExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz set import --force-update --set-id 'test-policy-set' --file ${allAlphaPolicySetsExport} --no-deps --prereqs": should import the policy set with the id "test-policy-set" from the file "${allAlphaPolicySetsExport}" with no dependencies`, async () => {
        const CMD = `frodo authz set import --force-update --set-id 'test-policy-set' --file ${allAlphaPolicySetsExport} --no-deps --prereqs`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz set import -i 'test-policy-set' -f ${allAlphaPolicySetsFileName} -D ${allDirectory}": should not import the policy set with the id "test-policy-set" from the file "${allAlphaPolicySetsExport}" when no changes are made`, async () => {
        const CMD = `frodo authz set import -i 'test-policy-set' -f ${allAlphaPolicySetsFileName} -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz set import -Ff ${allAlphaPolicySetsExport}": should import the first policy set from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -Ff ${allAlphaPolicySetsExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz set import --force-update --file ${allAlphaPolicySetsExport} --no-deps --prereqs": should import the first policy set from the file "${allAlphaPolicySetsExport}" with no dependencies`, async () => {
        const CMD = `frodo authz set import --force-update --file ${allAlphaPolicySetsExport} --no-deps --prereqs`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz set import -f ${allAlphaPolicySetsFileName} -D ${allDirectory}": should not import the first policy set from the file "${allAlphaPolicySetsExport}" when no changes are made`, async () => {
        const CMD = `frodo authz set import -f ${allAlphaPolicySetsFileName} -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz set import -Faf ${allAlphaPolicySetsExport}": should import all policy sets from the file "${allAlphaPolicySetsExport}"`, async () => {
        const CMD = `frodo authz set import -Faf ${allAlphaPolicySetsExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz set import --force-update --all --file ${allAlphaPolicySetsExport} --no-deps --prereqs": should import all policy sets from the file "${allAlphaPolicySetsExport}" with no dependencies`, async () => {
        const CMD = `frodo authz set import --force-update --all --file ${allAlphaPolicySetsExport} --no-deps --prereqs`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz set import -af ${allAlphaPolicySetsFileName} -D ${allDirectory}": should not import all policy sets from the file "${allAlphaPolicySetsExport}" when no changes are made`, async () => {
        const CMD = `frodo authz set import -af ${allAlphaPolicySetsFileName} -D ${allDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz set import -FAD ${allSeparatePolicySetsDirectory}": should import all policy sets from the ${allSeparatePolicySetsDirectory} directory"`, async () => {
        const CMD = `frodo authz set import -FAD ${allSeparatePolicySetsDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo authz set import --all-separate --no-deps --prereqs --directory ${allSeparatePolicySetsDirectory}": should fail when prerequisite resource type definitions are not included in the separate export files`, async () => {
        const CMD = `frodo authz set import --all-separate --no-deps --prereqs --directory ${allSeparatePolicySetsDirectory}`;
        await testFail(CMD, env);
    });

    test(`"frodo authz set import --all-separate --no-deps --directory ${allSeparatePolicySetsDirectory}": should not import policy sets from ${allSeparatePolicySetsDirectory} when no changes are made`, async () => {
        const CMD = `frodo authz set import --all-separate --no-deps --directory ${allSeparatePolicySetsDirectory}`;
        await testSuccess(CMD, env);
    });
});
