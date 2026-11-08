/** See test/e2e/README.md for how to write and record e2e tests. */

/*
      *************
******* DISCLAMER ******* To re-record these you will need to setup the cloud enviornment each time, you might also need to update the full-export-separate with a new export of the whole config with -AxND flags
      *************
FRODO_MOCK=record FRODO_TEST_NAME='emailtemplate' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='journey' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='authentication' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='resourcetype' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='script' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='idm' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='agent' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='policy' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='managedapplication' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='theme' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='application' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='variable' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='sync' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='mapping' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='service' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='journeyPromoteNoPrompt' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote --prune-no-prompt -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='node' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -e [put dir where you have the export]
*/
import { getEnv, testPromote } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
const sourceDir = `./test/e2e/exports/full-export-separate`

describe('frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*', () => {
    test.skip('"emailtemplate frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on email template changes', async () => {
        let name = 'emailtemplate';
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ['./global/emailTemplate', './global/idm/emailTemplate']
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"journey frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on journey changes', async () => {
        let name = "journey";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/journey", "./realm/root-bravo/journey"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test('"authentication frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on authentication changes', async () => {
        let name = "authentication";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/authentication", "./realm/root-bravo/authentication"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"resourcetype frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on resourcetype changes', async () => {
        let name = "resourcetype";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/resourcetype", "./realm/root-bravo/resourcetype"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"script frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on script changes', async () => {
        let name = "script";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/script"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"idm frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on idm changes', async () => {
        let name = "idm";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/idm/endpoint"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"idp frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on idp changes', async () => {
        let name = "idp";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/idp", "./realm/root-alpha/service"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"agent frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on agent changes', async () => {
        let name = "agent";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/agent", "./realm/root-bravo/agent"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"policy frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on policy changes', async () => {
        let name = "policy";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/policy"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test('"managedapplication frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on managedapplication changes', async () => {
        let name = "managedapplication";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/managedapplication", "./realm/root-bravo/managedapplication"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"theme frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on theme changes', async () => {
        let name = "theme";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/idm/ui", "./realm/root-bravo/theme"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"application frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on application changes', async () => {
        let name = "application";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-bravo/application", "./realm/root-bravo/managedapplication"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test('"variable frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on variable changes', async () => {
        let name = "variable";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/variable"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"sync frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on sync changes', async () => {
        let name = "sync";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/sync"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test('"mapping frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on mapping changes', async () => {
        let name = "mapping";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/mapping", "./realm/root-bravo/journey"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"service frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on service changes', async () => {
        let name = "service";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-bravo/service", "./realm/root-alpha/service"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });

    test.skip('"node frodo promote -M ./test/e2e/exports/full-export-separate -e ./tmp/tmp-*": this should run a promote on node changes', async () => {
        let name = "node";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/nodeTypes"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name)
    });
});