/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    If your command completes without errors and with the expected results,
 *    all the required mocks already exist and you are good to write your
 *    test and skip to step #4.
 *
 *    If, however, your command fails and you see errors like the one below,
 *    you know you need to record the mock responses first:
 *
 *    [Polly] [adapter:node-http] Recording for the following request is not found and `recordIfMissing` is `false`.
 *
 * 2. Record mock responses for your exact command.
 *    In mock record mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=record frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    Wait until you see all the Polly instances (mock recording adapters) have
 *    shutdown before you try to run step #1 again.
 *    Messages like these indicate mock recording adapters shutting down:
 *
 *    Polly instance 'conn/4' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 2s...
 *    Polly instance 'conn/save/3' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 1s...
 *    Polly instance 'conn/save/3' stopping in 2s...
 *    Polly instance 'conn/4' stopped.
 *    Polly instance 'conn/save/3' stopping in 1s...
 *    Polly instance 'conn/save/3' stopped.
 *
 * 3. Validate your freshly recorded mock responses are complete and working.
 *    Re-run the exact command you want to test in mock mode (see step #1).
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Commit both your test and your new recordings to the repository.
 *    Your tests are likely going to reside outside the frodo-lib project but
 *    the recordings must be committed to the frodo-lib project.
 */

/*
      *************
******* DISCLAMER ******* To re-record these you will need to setup the cloud enviornment each time, you might also need to update the full-export-separate with a new export of the whole config with -AxND flags
      *************
FRODO_MOCK=record FRODO_TEST_NAME='emailtemplate' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='journey' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='authentication' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='resourcetype' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='script' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='idm' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='agent' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='policy' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='managedapplication' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='theme' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='application' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='variable' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='sync' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='mapping' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='service' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
FRODO_MOCK=record FRODO_TEST_NAME='journeyPromoteNoPrompt' FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo promote --prune-no-prompt -M ./test/e2e/exports/full-export-separate -E [put dir where you have the export]
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes, testPromote} from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);
const sourceDir = `./test/e2e/exports/full-export-separate`

const type = 'oauth2.app';

describe('frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*', () => {
    test('"emailtemplate frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on email template changes', async () => {
        let name = 'emailtemplate';
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ['./global/emailTemplate', './global/idm/emailTemplate']
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 1)
    });

    test('"journey frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on journey changes', async () => {
        let name = "journey";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/journey", "./realm/root-bravo/journey"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 2)
    });

    test('"authentication frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on authentication changes', async () => {
        let name = "authentication";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/authentication", "./realm/root-bravo/authentication"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 3)
    });

    test('"resourcetype frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on resourcetype changes', async () => {
        let name = "resourcetype";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/resourcetype", "./realm/root-bravo/resourcetype"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 4)
    });

    test('"script frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on script changes', async () => {
        let name = "script";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/script"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 5)
    });

    test('"idm frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on idm changes', async () => {
        let name = "idm";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/idm/endpoint"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 6)
    });

    test('"idp frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on idp changes', async () => {
        let name = "idp";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/idp", "./realm/root-alpha/service"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 7)
    });

    test('"agent frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on agent changes', async () => {
        let name = "agent";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/agent", "./realm/root-bravo/agent"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 8)
    });

    test('"policy frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on policy changes', async () => {
        let name = "policy";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/policy"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 9)
    });

    test('"managedapplication frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on managedapplication changes', async () => {
        let name = "managedapplication";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-alpha/managedapplication", "./realm/root-bravo/managedapplication"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 10)
    });

    test('"theme frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on theme changes', async () => {
        let name = "theme";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/idm/ui", "./realm/root-bravo/theme"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 11)
    });

    test('"application frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on application changes', async () => {
        let name = "application";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-bravo/application", "./realm/root-bravo/managedapplication"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 12)
    });

    test('"variable frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on variable changes', async () => {
        let name = "variable";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/variable"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 13)
    });

    test('"sync frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on sync changes', async () => {
        let name = "sync";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/sync"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 14)
    });

    test('"mapping frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on mapping changes', async () => {
        let name = "mapping";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./global/mapping", "./realm/root-bravo/journey"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 1)
    });

    test('"service frodo promote -M ./test/e2e/exports/full-export-separate -E ./tmp/tmp-*": this should run a promote on service changes', async () => {
        let name = "service";
        env.env.FRODO_TEST_NAME = name
        let modifiedDir = `./test/e2e/exports/promote/${name}`;
        let referenceSubDirs = ["./realm/root-bravo/service", "./realm/root-alpha/service"]
        await testPromote(sourceDir, modifiedDir, referenceSubDirs, env, name, 16)
    });
});