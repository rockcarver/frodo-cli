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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir1 -p OAuth2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir2 -r bravo
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir3 -n 'Bravo OIDC Claims Script' -r bravo 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir4 -r bravo -p OAuth2 --just-config --script-type OAUTH2_MAY_ACT --just-content --language GROOVY
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir5 --language GROOVY
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir6 --just-content
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir7 -r bravo -p SAML2 --just-config
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir8 -r bravo --just-content
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir9 -r bravo -p SAML2 --just-config --script-type SAML2_NAMEID_MAPPER
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir10 --just-config
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir11 -r bravo --just-config
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir12 -r bravo -p SAML2 --just-content
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir13 --just-config --just-content
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir14 --script-type LIBRARY
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir15 -r bravo --script-type LIBRARY
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir16 -n 'Coin Flip'
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir17 -r bravo -p SAML2 --script-type SAML2_NAMEID_MAPPER
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull scripts -D configManagerExportScriptsDir18 -r bravo -p SAML2

*/

import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pull scripts', () => {
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir0": should export all scripts from all realms in fr-config manager style.`, async () => {
        const dirName = 'configManagerExportScriptsDir0';
        const CMD = `frodo config-manager pull scripts -D ${dirName}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir1 -p OAuth2": should export all scripts from all realms that start with OAuth2 in fr-config manager style.`, async () => {
        const dirName = 'configManagerExportScriptsDir1';
        const prefix = 'OAuth2'
        const CMD = `frodo config-manager pull scripts -D ${dirName} -p ${prefix}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir2 -r bravo": should export all scripts from the bravo realm in fr-config manager style.`, async () => {
        const dirName = 'configManagerExportScriptsDir2';
        const realm = 'bravo';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -r ${realm}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir3 -n 'Bravo OIDC Claims Script' -r bravo": should export only the script with the name: "Bravo OIDC Claims Script".`, async () => {
        const dirName = 'configManagerExportScriptsDir3';
        const scriptName = 'Bravo OIDC Claims Script';
        const realm = 'bravo';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -n '${scriptName}' -r ${realm}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir4 -r bravo -p OAuth2 --just-config --script-type OAUTH2_MAY_ACT --just-content --language GROOVY": should export just the script content in the bravo realm that start with OAuth2 that are of the type OAuth2 May Act and are in the programming language of groovy".`, async () => {
        const dirName = 'configManagerExportScriptsDir4';
        const realm = 'bravo';
        const prefix = 'OAuth2'
        const scriptType = 'OAUTH2_MAY_ACT';
        const language = 'GROOVY';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -r ${realm} -p ${prefix} --just-config --script-type ${scriptType} --just-content --language ${language}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir5 --language GROOVY": should export all groovy scripts`, async () => {
        const language = 'GROOVY';
        const dirName = 'configManagerExportScriptsDir5';
        const CMD = `frodo config-manager pull scripts -D ${dirName} --language ${language}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir7 -r bravo -p SAML2 --just-config": should export just-config with prefix SAML2 in bravo realm `, async () => {
        const dirName = 'configManagerExportScriptsDir7';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -r bravo -p SAML2 --just-config`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir8 -r bravo --just-content": should export just content in bravo realm `, async () => {
        const dirName = 'configManagerExportScriptsDir8';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -r bravo --just-content`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir9 -r bravo -p SAML2 --just-config --script-type SAML2_NAMEID_MAPPER": should export scripts with prefix: SAML2, just-config, script-type: SAML2_NAMEID_MAPPER in bravo realm`, async () => {
        const dirName = 'configManagerExportScriptsDir9';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -r bravo -p SAML2 --just-config --script-type SAML2_NAMEID_MAPPER`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir10 --just-config": should export just-config`, async () => {
        const dirName = 'configManagerExportScriptsDir10';
        const CMD = `frodo config-manager pull scripts -D ${dirName} --just-config`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir11 -r bravo --just-config": should export all groovy scripts`, async () => {
        const dirName = 'configManagerExportScriptsDir11';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -r bravo --just-config`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir12 -r bravo -p SAML2 --just-content": should export all groovy scripts`, async () => {
        const dirName = 'configManagerExportScriptsDir12';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -r bravo -p SAML2 --just-content`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir13 --just-config --just-content": should export all just config and just content`, async () => {
        const dirName = 'configManagerExportScriptsDir13';
        const CMD = `frodo config-manager pull scripts -D ${dirName} --just-config --just-content`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir14 --script-type LIBRARY": should export all scripts-type library`, async () => {
        const dirName = 'configManagerExportScriptsDir14';
        const CMD = `frodo config-manager pull scripts -D ${dirName} --script-type LIBRARY`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir15 -r bravo --script-type LIBRARY": should export scripts-type LIBRARY in bravo realm only`, async () => {
        const dirName = 'configManagerExportScriptsDir15';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -r bravo --script-type LIBRARY`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir16 -n 'Coin Flip'": should export script name: coin Flip`, async () => {
        const dirName = 'configManagerExportScriptsDir16';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -n 'Coin Flip'`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir17 -r bravo -p SAML2 --script-type SAML2_NAMEID_MAPPER": should export scripts with prefix SAML2 and script-type SAML2_NAMEID_MAPPER in bravo realm`, async () => {
        const dirName = 'configManagerExportScriptsDir17';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -r bravo -p SAML2 --script-type SAML2_NAMEID_MAPPER`;
        await testExport(CMD, env, undefined, undefined, dirName, false);

    });
    test(`"frodo config-manager pull scripts -D configManagerExportScriptsDir18 -r bravo -p SAML2" should export scripts with prefix SAML2 from bravo realm `, async () => {
        const dirName = 'configManagerExportScriptsDir18';
        const CMD = `frodo config-manager pull scripts -D ${dirName} -r bravo -p SAML2`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
});