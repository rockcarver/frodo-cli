/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable import -Fi esv-test-var -f test/e2e/exports/all/allVariables.variable.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable import --force-update --variable-id esv-test-var --file test/e2e/exports/all/allVariables.variable.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable import -i esv-test-var -f allVariables.variable.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable import -Ff test/e2e/exports/all/allVariables.variable.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable import -f allVariables.variable.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable import -Fa --file test/e2e/exports/all/allVariables.variable.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable import -a -f allVariables.variable.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable import -FAD test/e2e/exports/all-separate/cloud/global/variable
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable import --all-separate --directory test/e2e/exports/all-separate/cloud/global/variable
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable import -Ff esv-test-var.variable.json --directory test/e2e/exports/all-separate/cloud/global/variable
*/
import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = 'test/e2e/exports/all';
const allVariablesFileName = 'allVariables.variable.json';
const allVariablesExport = `${allDirectory}/${allVariablesFileName}`;
const allSeparateVariablesDirectory = `test/e2e/exports/all-separate/cloud/global/variable`;

describe('frodo esv variable import', () => {
  test(`"frodo esv variable import -Fi esv-test-var -f ${allVariablesExport}" Import variable "esv-test-var" from "${allVariablesExport}".`, async () => {
    const CMD = `frodo esv variable import -Fi esv-test-var -f ${allVariablesExport}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo esv variable import --force-update --variable-id esv-test-var --file ${allVariablesExport}" Import variable "esv-test-var" from "${allVariablesFileName}".`, async () => {
    const CMD = `frodo esv variable import --force-update --variable-id esv-test-var --file ${allVariablesExport}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo esv variable import -i esv-test-var -f ${allVariablesFileName} -D ${allDirectory}" Import variable "esv-test-var" from "${allVariablesFileName}" in directory "${allDirectory}".`, async () => {
    const CMD = `frodo esv variable import -i esv-test-var -f ${allVariablesFileName} -D ${allDirectory}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo esv variable import -Ff ${allVariablesExport}" Import first variable from "${allVariablesExport}".`, async () => {
    const CMD = `frodo esv variable import -Ff ${allVariablesExport}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo esv variable import -f ${allVariablesFileName} -D ${allDirectory}" Import first variable from "${allVariablesFileName}" in directory "${allDirectory}"`, async () => {
    const CMD = `frodo esv variable import -f ${allVariablesFileName} -D ${allDirectory}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo esv variable import -Fa --file ${allVariablesExport}" Import all variables from "${allVariablesExport}".`, async () => {
    const CMD = `frodo esv variable import -Fa --file ${allVariablesExport}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo esv variable import -a -f ${allVariablesFileName} -D ${allDirectory}" Import all variables from "${allVariablesFileName}" in directory "${allSeparateVariablesDirectory}".`, async () => {
    const CMD = `frodo esv variable import -a -f ${allVariablesFileName} -D ${allDirectory}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo esv variable import -FAD ${allSeparateVariablesDirectory}" Import all variables in directory "${allSeparateVariablesDirectory}".`, async () => {
    const CMD = `frodo esv variable import -FAD ${allSeparateVariablesDirectory}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo esv variable import --all-separate --directory ${allSeparateVariablesDirectory}" Import all variables in directory "${allSeparateVariablesDirectory}".`, async () => {
    const CMD = `frodo esv variable import --all-separate --directory ${allSeparateVariablesDirectory}`;
    await testSuccess(CMD, env);
  });

  test(`"frodo esv variable import -Ff esv-test-var.variable.json --directory ${allSeparateVariablesDirectory}" Import first variable from "esv-test-var.variable.json" in directory "${allSeparateVariablesDirectory}".`, async () => {
    const CMD = `frodo esv variable import -Ff esv-test-var.variable.json --directory ${allSeparateVariablesDirectory}`;
    await testSuccess(CMD, env);
  });
});
