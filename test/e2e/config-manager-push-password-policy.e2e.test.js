/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push password-policy -D test/e2e/exports/fr-config-manager/cloud -m cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager push password-policy -r alpha -D test/e2e/exports/fr-config-manager/cloud -m cloud

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push password-policy -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push password-policy -r alpha -D test/e2e/exports/fr-config-manager/forgeops -m forgeops
*/

import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { forgeops_connection as fc, connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);
const forgeopsEnv = getEnv(fc);

const cloudAllDirectory = "test/e2e/exports/fr-config-manager/cloud";
const forgeopsAllDirectory = "test/e2e/exports/fr-config-manager/forgeops";

describe('frodo config-manager push password-policy', () => {
    describe('Cloud', () => {
        test(`"frodo config-manager push password-policy -D ${cloudAllDirectory} -m cloud": should import the password policy into AIC"`, async () => {
            const CMD = `frodo config-manager push password-policy -D ${cloudAllDirectory} -m cloud`;
            const { stdout } = await exec(CMD, cloudEnv);
            expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
        });

        test(`"frodo config-manager push password-policy -r alpha -D ${cloudAllDirectory} -m cloud": should import a specific password policy by name into AIC"`, async () => {
            const CMD = `frodo config-manager push password-policy -r alpha -D ${cloudAllDirectory} -m cloud`;
            const { stdout } = await exec(CMD, cloudEnv);
            expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
        });
    });

    describe.skip('ForgeOps', () => {
        test(`"frodo config-manager push password-policy -D ${forgeopsAllDirectory} -m forgeops": should import the password policy into forgeops"`, async () => {
            const CMD = `frodo config-manager push password-policy -D ${forgeopsAllDirectory} -m forgeops`;
            const { stdout } = await exec(CMD, forgeopsEnv);
            expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
        });

        test(`"frodo config-manager push password-policy -r alpha -D ${forgeopsAllDirectory} -m forgeops": should import a specific password policy by name into forgeops"`, async () => {
            const CMD = `frodo config-manager push password-policy -r alpha -D ${forgeopsAllDirectory} -m forgeops`;
            const { stdout } = await exec(CMD, forgeopsEnv);
            expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
        });
    });
});
