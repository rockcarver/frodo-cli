/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import -i script -D test/e2e/exports/all-separate/cloud/global/idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import -f test/e2e/exports/all-separate/cloud/global/idm/script.idm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import --entity-id script --file test/e2e/exports/all-separate/cloud/global/idm/script.idm.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import -i script --env-file test/e2e/env/testEnvFile.env -f script.idm.json -D test/e2e/exports/all-separate/cloud/global/idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import -af test/e2e/exports/all/all.idm.json --env-file test/e2e/env/testEnvFile.env -e test/e2e/env/testEntitiesFile.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import --all --file all.idm.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import -AD test/e2e/exports/all-separate/cloud/global/idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm import --all-separate --directory test/e2e/exports/all-separate/cloud/global/idm --env-file test/e2e/env/testEnvFile.env --entities-file test/e2e/env/testEntitiesFile.json

// ForgeOps
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo idm import -AD test/e2e/exports/all-separate/forgeops/global/idm -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo idm import -f test/e2e/exports/all-separate/forgeops/global/idm/endpoint/Groovy/Groovy.idm.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo idm import --file test/e2e/exports/all-separate/forgeops/global/sync/sync.idm.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo idm import -f test/e2e/exports/all-separate/forgeops/global/idm/managed/managed.idm.json --type forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo idm import -i endpoint/Groovy -f test/e2e/exports/all-separate/forgeops/global/idm/endpoint/Groovy/Groovy.idm.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo idm import --entity-id sync -f test/e2e/exports/all-separate/forgeops/global/sync/sync.idm.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo idm import -i managed -f test/e2e/exports/all-separate/forgeops/global/idm/managed/managed.idm.json --type forgeops
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv,  testFail,  testSuccess } from './utils/TestUtils';
import { connection as c , forgeops_connection as fc} from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

const idmExportDirectory = "test/e2e/exports/all-separate/cloud/global/idm";
const forgeopsExportDirectory = "test/e2e/exports/all-separate/forgeops";
const forgeopsIdmExportDirectory = `${forgeopsExportDirectory}/global/idm`;
const idmScriptConfigFileName = "script.idm.json";
const idmScriptConfigExport = `${idmExportDirectory}/${idmScriptConfigFileName}`;
const allIdmExportDirectory = 'test/e2e/exports/all';
const allIdmExportFileName = 'all.idm.json';
const allIdmExport = `${allIdmExportDirectory}/${allIdmExportFileName}`;
const testEntitiesFile = 'test/e2e/env/testEntitiesFile.json';
const testEnvFile = 'test/e2e/env/testEnvFile.env';

describe('frodo idm import', () => {

    // Cloud Tests

    test(`"frodo idm import -i script -D ${idmExportDirectory}": should import the idm config with name 'script' from the directory ${idmExportDirectory}"`, async () => {
        const CMD = `frodo idm import -i script -D ${idmExportDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo idm import -f ${idmScriptConfigExport}": should import the idm config from the file named '${idmScriptConfigExport}'"`, async () => {
        const CMD = `frodo idm import -f ${idmScriptConfigExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo idm import --entity-id script --file ${idmScriptConfigExport}": should import the idm config with name 'script' from the file named '${idmScriptConfigExport}'"`, async () => {
        const CMD = `frodo idm import --entity-id script --file ${idmScriptConfigExport}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo idm import -i script --env-file ${testEnvFile} -f ${idmScriptConfigFileName} -D ${idmExportDirectory}": should import the idm config with name 'script' from the file named '${idmScriptConfigExport}'"`, async () => {
        const CMD = `frodo idm import -i script --env-file ${testEnvFile} -f ${idmScriptConfigFileName} -D ${idmExportDirectory}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo idm import -af ${allIdmExport} --env-file ${testEnvFile} -e ${testEntitiesFile}": Should import all configs from the file '${allIdmExport}' according to the env and entity files"`, async () => {
        const CMD = `frodo idm import -af ${allIdmExport} --env-file ${testEnvFile} -e ${testEntitiesFile}`;
        await testSuccess(CMD, env);
    });

    test(`"frodo idm import --all --file ${allIdmExportFileName} -D ${allIdmExportDirectory}": Should import all configs from the file '${allIdmExportFileName}' in directory '${allIdmExportDirectory}'"`, async () => {
        const CMD = `frodo idm import --all --file ${allIdmExportFileName} -D ${allIdmExportDirectory}`;
        await testFail(CMD, env);
    });

    test(`"frodo idm import -AD ${idmExportDirectory}": Should import all configs from the directory '${idmExportDirectory}'"`, async () => {
        const CMD = `frodo idm import -AD ${idmExportDirectory}`;
        await testFail(CMD, env);
    });

    test(`"frodo idm import --all-separate --directory ${idmExportDirectory} --env-file ${testEnvFile} --entities-file ${testEntitiesFile}": Should import all configs from the directory '${idmExportDirectory}' according to the env and entity files"`, async () => {
        const CMD = `frodo idm import --all-separate --directory ${idmExportDirectory} --env-file ${testEnvFile} --entities-file ${testEntitiesFile}`;
        await testSuccess(CMD, env);
    });

    // Forgeops Tests

    test(`"frodo idm import -AD ${forgeopsIdmExportDirectory} -m forgeops": Should import all config from the directory '${forgeopsIdmExportDirectory}'.`, async () => {
        const CMD = `frodo idm import -AD ${forgeopsIdmExportDirectory} -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });

    test(`"frodo idm import -f ${forgeopsIdmExportDirectory}/endpoint/Groovy/Groovy.idm.json -m forgeops": Should import idm configuration 'endpoint/Groovy'.`, async () => {
        const CMD = `frodo idm import -f ${forgeopsIdmExportDirectory}/endpoint/Groovy/Groovy.idm.json -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });

    test(`"frodo idm import --file ${forgeopsExportDirectory}/global/sync/sync.idm.json -m forgeops": Should import idm configuration 'sync'.`, async () => {
        const CMD = `frodo idm import --file ${forgeopsExportDirectory}/global/sync/sync.idm.json -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });

    test(`"frodo idm import -f ${forgeopsIdmExportDirectory}/managed/managed.idm.json --type forgeops": Should import idm configuration 'managed'.`, async () => {
        const CMD = `frodo idm import -f ${forgeopsIdmExportDirectory}/managed/managed.idm.json --type forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });

    test(`"frodo idm import -i endpoint/Groovy -f ${forgeopsIdmExportDirectory}/endpoint/Groovy/Groovy.idm.json -m forgeops": Should import idm configuration 'endpoint/Groovy'.`, async () => {
        const CMD = `frodo idm import -i endpoint/Groovy -f ${forgeopsIdmExportDirectory}/endpoint/Groovy/Groovy.idm.json -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });

    test(`"frodo idm import --entity-id sync -f ${forgeopsExportDirectory}/global/sync/sync.idm.json -m forgeops": Should import idm configuration 'sync'.`, async () => {
        const CMD = `frodo idm import --entity-id sync -f ${forgeopsExportDirectory}/global/sync/sync.idm.json -m forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });

    test(`"frodo idm import -i managed -f ${forgeopsIdmExportDirectory}/managed/managed.idm.json --type forgeops": Should import idm configuration 'managed'.`, async () => {
        const CMD = `frodo idm import -i managed -f ${forgeopsIdmExportDirectory}/managed/managed.idm.json --type forgeops`;
        await testSuccess(CMD, forgeopsEnv);
    });
});
