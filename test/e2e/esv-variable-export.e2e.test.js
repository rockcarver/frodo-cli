/** See test/e2e/README.md for how to write and record e2e tests. */

/*
To create test data, run these:

FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create -i esv-test-var --value "this is a test variable" --description "this is a test description"
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create --variable-id "esv-trinity-phone" --value "(312)-555-0690" --description "In the opening of The Matrix (1999), the phone number Trinity is calling from is traced to (312)-555-0690"
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create --variable-id "esv-nebuchadnezzar-crew" --variable-type array --value '["Morpheus","Trinity","Link","Tank","Dozer","Apoc","Cypher","Mouse","Neo","Switch"]' --description "The crew of the Nebuchadnezzar hovercraft."
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create --variable-id "esv-nebuchadnezzar-crew-structure" --variable-type object --value '{"Captain":"Morpheus","FirstMate":"Trinity","Operator":["Link","Tank"],"Medic":"Dozer","Crewmen":["Apoc","Cypher","Mouse","Neo","Switch"]}' --description "The structure of the crew of the Nebuchadnezzar hovercraft."
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create --variable-id "esv-neo-age" --variable-type int --value '28' --description "Neo's age in the matrix."
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create --variable-id "esv-blue-piller" --variable-type bool --value 'false' --description "Zion membership criteria."
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create --variable-id esv-ipv4-cidr-access-rules --variable-type object --value '{ "allow": [ "145.118.0.0/16", "132.35.0.0/16", "101.226.0.0/16", "99.72.28.182/32" ] }' --description 'IPv4 CIDR access rules: { "allow": [ "address/mask" ] }'
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create --variable-id esv-test-var-pi-string --value "3.1415926" --description "This is another test variable." --variable-type string
FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable create -i esv-test-var-pi --value "3.1415926" --description "This is another test variable." --variable-type number

To record, run these:

FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable export --variable-id esv-test-var
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable export -i esv-test-var -f my-esv-test-var.variable.json --no-decode
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable export -MNi esv-test-var -D variableExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable export -a --file my-allVariables.variable.json --no-decode
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable export -MNaD variableExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable export --modified-properties --all-separate --no-metadata --directory variableExportTestDir3 --no-decode
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'variable';

describe('frodo esv variable export', () => {
    test('"frodo esv variable export --variable-id esv-test-var": should export the variable with variable id "esv-test-var"', async () => {
        const exportFile = "esv-test-var.variable.json";
        const CMD = `frodo esv variable export --variable-id esv-test-var`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo esv variable export -i esv-test-var -f my-esv-test-var.variable.json --no-decode": should export the variable with variable id "esv-test-var" into file named my-esv-test-var.variable.json', async () => {
        const exportFile = "my-esv-test-var.variable.json";
        const CMD = `frodo esv variable export -i esv-test-var -f ${exportFile} --no-decode`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo esv variable export -MNi esv-test-var -D variableExportTestDir1": should export the variable with variable id "esv-test-var" into the directory named variableExportTestDir1', async () => {
        const exportDirectory = "variableExportTestDir1";
        const CMD = `frodo esv variable export -MNi esv-test-var -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo esv variable export --all": should export all variables to a single file', async () => {
        const exportFile = "allVariables.variable.json";
        const CMD = `frodo esv variable export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo esv variable export -a --file my-allVariables.variable.json --no-decode": should export all variables to a single file named my-allVariables.variable.json', async () => {
        const exportFile = "my-allVariables.variable.json";
        const CMD = `frodo esv variable export -a --file ${exportFile} --no-decode`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo esv variable export -MNaD variableExportTestDir2": should export all variables to a single file in the directory variableExportTestDir2', async () => {
        const exportDirectory = "variableExportTestDir2";
        const CMD = `frodo esv variable export -MNaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo esv variable export -A": should export all variables to separate files', async () => {
        const CMD = `frodo esv variable export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo esv variable export --modified-properties --all-separate --no-metadata --directory variableExportTestDir3 --no-decode": should export all variables to separate files in the directory variableExportTestDir3', async () => {
        const exportDirectory = "variableExportTestDir3";
        const CMD = `frodo esv variable export --modified-properties --all-separate --no-metadata --directory ${exportDirectory} --no-decode`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
