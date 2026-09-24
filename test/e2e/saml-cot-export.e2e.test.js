/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export --cot-id AzureCOT
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export -i AzureCOT -f my-AzureCOT.cot.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export -Ni AzureCOT -D samlCotExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export -a --file my-allAlphaCirclesOfTrust.cot.saml.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export -NaD samlCotExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml cot export --all-separate --no-metadata --directory samlCotExportTestDir3
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'cot.saml';

describe('frodo saml cot export', () => {
    test('"frodo saml cot export --cot-id AzureCOT": should export the saml circles of trust with id "AzureCOT"', async () => {
        const exportFile = "AzureCOT.cot.saml.json";
        const CMD = `frodo saml cot export --cot-id AzureCOT`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo saml cot export -i AzureCOT -f my-AzureCOT.cot.saml.json": should export the saml circles of trust with id "AzureCOT" into file named my-AzureCOT.cot.saml.json', async () => {
        const exportFile = "my-AzureCOT.cot.saml.json";
        const CMD = `frodo saml cot export -i AzureCOT -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo saml cot export -Ni AzureCOT -D samlCotExportTestDir1": should export the saml circles of trust with id "AzureCOT" into the directory named samlCotExportTestDir1', async () => {
        const exportDirectory = "samlCotExportTestDir1";
        const CMD = `frodo saml cot export -Ni AzureCOT -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo saml cot export --all": should export all saml circles of trust to a single file', async () => {
        const exportFile = "allAlphaCirclesOfTrust.cot.saml.json";
        const CMD = `frodo saml cot export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo saml cot export -a --file my-allAlphaCirclesOfTrust.cot.saml.json": should export all saml circles of trust to a single file named my-allAlphaCirclesOfTrust.cot.saml.json', async () => {
        const exportFile = "my-allAlphaCirclesOfTrust.cot.saml.json";
        const CMD = `frodo saml cot export -a --file ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo saml cot export -NaD samlCotExportTestDir2": should export all saml circles of trust to a single file in the directory samlCotExportTestDir2', async () => {
        const exportDirectory = "samlCotExportTestDir2";
        const CMD = `frodo saml cot export -NaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo saml cot export -A": should export all saml circles of trust to separate files', async () => {
        const CMD = `frodo saml cot export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo saml cot export --all-separate --no-metadata --directory samlCotExportTestDir3": should export all saml circles of trust to separate files in the directory samlCotExportTestDir3', async () => {
        const exportDirectory = "samlCotExportTestDir3";
        const CMD = `frodo saml cot export --all-separate --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
