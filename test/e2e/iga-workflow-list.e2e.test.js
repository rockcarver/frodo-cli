/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow list
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow list -l
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo iga workflow list --long
 */
import { getEnv, testSuccess } from './utils/TestUtils';
import { iga_connection as ic } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const igaEnv = getEnv(ic);

// Lists whatever IGA workflows exist on the target tenant -- no specific
// workflow needs to be staged first. Ready to record as-is once the shared
// login cassette exists for the target host (see test/e2e/README.md).
describe('frodo iga workflow list', () => {
  test('"frodo iga workflow list": should list the ids of the workflows', async () => {
    const CMD = `frodo iga workflow list`;
    await testSuccess(CMD, igaEnv);
  });

  test('"frodo iga workflow list -l": should list the ids, names, mutability, and statuses of the workflows.', async () => {
    const CMD = `frodo iga workflow list -l`;
    await testSuccess(CMD, igaEnv);
  });

  test('"frodo iga workflow list --long": should list the ids, names, mutability, and statuses of the workflows.', async () => {
    const CMD = `frodo iga workflow list --long`;
    await testSuccess(CMD, igaEnv);
  });
});
