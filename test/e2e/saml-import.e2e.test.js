/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -i iSPAzure -f test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import --no-deps --entity-id iSPAzure --file test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -i iSPAzure -f allAlphaProviders.saml.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -f test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import --no-deps --file test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -f allAlphaProviders.saml.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -af test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import --all --no-deps --file test/e2e/exports/all/allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -af allAlphaProviders.saml.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import -AD test/e2e/exports/all-separate/cloud/realm/root-alpha/saml
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml import --all-separate --no-deps --directory test/e2e/exports/all-separate/cloud/realm/root-alpha/saml
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allAlphaSamlProvidersFileName = "allAlphaProviders.saml.json";
const allAlphaSamlProvidersExport = `${allDirectory}/${allAlphaSamlProvidersFileName}`;
const allSeparateSamlProvidersDirectory = "test/e2e/exports/all-separate/cloud/realm/root-alpha/saml";

describe('frodo saml import', () => {
    test(`"frodo saml import -i iSPAzure -f ${allAlphaSamlProvidersExport}": should import the saml provider with the id "iSPAzure" from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -i iSPAzure -f ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo saml import --no-deps --entity-id iSPAzure --file ${allAlphaSamlProvidersExport}": should import the saml provider with the id "iSPAzure" from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import --no-deps --entity-id iSPAzure --file ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo saml import -i iSPAzure -f ${allAlphaSamlProvidersFileName} -D ${allDirectory}": should import the saml provider with the id "iSPAzure" from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -i iSPAzure -f ${allAlphaSamlProvidersFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo saml import -f ${allAlphaSamlProvidersExport}": should import the first saml provider from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -f ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo saml import --no-deps --file ${allAlphaSamlProvidersExport}": should import the first saml from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import --no-deps --file ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo saml import -f ${allAlphaSamlProvidersExport}": should import the first saml provider from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -f ${allAlphaSamlProvidersFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo saml import -af ${allAlphaSamlProvidersExport}": should import all saml providers from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -af ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo saml import --all --no-deps --file ${allAlphaSamlProvidersExport}": should import all saml providers from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import --all --no-deps --file ${allAlphaSamlProvidersExport}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo saml import -af ${allAlphaSamlProvidersExport}": should import all saml providers from the file "${allAlphaSamlProvidersExport}"`, async () => {
        const CMD = `frodo saml import -af ${allAlphaSamlProvidersFileName} -D ${allDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo saml import -AD ${allSeparateSamlProvidersDirectory}": should import all saml providers from the '${allSeparateSamlProvidersDirectory}' directory"`, async () => {
        const CMD = `frodo saml import -AD ${allSeparateSamlProvidersDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo saml import --all-separate --no-deps --directory ${allSeparateSamlProvidersDirectory}": should import all saml providers from the '${allSeparateSamlProvidersDirectory}' directory"`, async () => {
        const CMD = `frodo saml import --all-separate --no-deps --directory ${allSeparateSamlProvidersDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
