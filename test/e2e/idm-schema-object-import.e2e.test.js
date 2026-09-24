/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object import -D test/e2e/exports/all-separate/cloud/global/idm/managed
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object import -o -f test/e2e/exports/all-separate/cloud/global/idm/managed/alpha_user.managed.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object import -f test/e2e/exports/all/all.managed.json
// Forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo idm schema object import -D test/e2e/exports/all-separate/forgeops/global/idm/managed -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo idm schema object import -f test/e2e/exports/all-separate/forgeops/global/idm/managed/managed.idm.json -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo idm schema object import -o -f test/e2e/exports/all-separate/forgeops/global/idm/managed/groovy/groovy.managed.json -m forgeops
*/
import { getEnv, testFail } from './utils/TestUtils';
import { connection as c , forgeops_connection as fc} from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);
const forgeopsEnv = getEnv(fc);

const managedObjectsExportDirectory =
  'test/e2e/exports/all-separate/cloud/global/idm/managed';
const forgeopsManagedObjectsExportDirectory =
  'test/e2e/exports/all-separate/forgeops/global/idm/managed';
const alphaUserFile = 'alpha_user.managed.json';
const allManagedPath = 'test/e2e/exports/all/all.managed.json';

// All of the fixtures below carry a schema for at least one managed-object
// type, so they now hit the schema-change confirmation gate added to
// 'frodo idm schema object import'. None of these commands pass -y/--yes,
// and these tests run non-interactively (no TTY), so the command is
// expected to correctly refuse and exit non-zero rather than hang or
// silently write a schema change — see idm-schema-object-import.ts.
// Passing -y would exercise the full successful-import path instead, but
// -y is itself a flag recorded into these fixtures' Polly recording name
// (see SetupPollyForFrodoLib.getFrodoArgsId), so doing that here would
// require fresh recordings from a live tenant, which these mocked tests
// don't have. That's tracked as follow-up work for whoever next has live
// tenant access, not something these tests can produce on their own.
// When that follow-up is done, the successful (-y) import must target a
// custom managed object type, not a built-in one like alpha_user or
// groovy — import actually writes/mutates schema, and doing that against
// a built-in type in the shared test tenant risks corrupting it. Export
// tests are read-only and safe against any type, including built-in ones.
describe('frodo idm import', () => {

  // Cloud Tests

  test(`"frodo idm schema object import -D ${managedObjectsExportDirectory}": should refuse to import the managed objects from the directory ${managedObjectsExportDirectory} without -y`, async () => {
    const CMD = `frodo idm schema object import -D ${managedObjectsExportDirectory}`;
    await testFail(CMD, env);
  });

  test(`"frodo idm schema object import -o -f ${managedObjectsExportDirectory}/${alphaUserFile}": should refuse to import just the alpha user managed object ${managedObjectsExportDirectory}/${alphaUserFile} without -y`, async () => {
    const CMD = `frodo idm schema object import -o -f ${managedObjectsExportDirectory}/${alphaUserFile}`;
    await testFail(CMD, env);
  });

  test(`"frodo idm schema object import -f ${allManagedPath}": should refuse to import all managed objects from a single file ${allManagedPath} without -y`, async () => {
    const CMD = `frodo idm schema object import -f ${allManagedPath}`;
    await testFail(CMD, env);
  });

  // Forgeops Tests

  test(`"frodo idm schema object import -D ${forgeopsManagedObjectsExportDirectory} -m forgeops": should refuse to import the managed objects from the directory '${forgeopsManagedObjectsExportDirectory}' without -y.`, async () => {
    const CMD = `frodo idm schema object import -D ${forgeopsManagedObjectsExportDirectory} -m forgeops`;
    await testFail(CMD, forgeopsEnv);
  });

  test(`"frodo idm schema object import -f ${forgeopsManagedObjectsExportDirectory}/managed.idm.json -m forgeops": should refuse to import the managed objects from a single file '${forgeopsManagedObjectsExportDirectory}/managed.idm.json' without -y`, async () => {
    const CMD = `frodo idm schema object import -f ${forgeopsManagedObjectsExportDirectory}/managed.idm.json -m forgeops`;
    await testFail(CMD, forgeopsEnv);
  });

  // No recording exists for this exact forgeops scenario (the "0_o_f_m_*"
  // fixture is missing entirely, same underlying gap as the export test's
  // groovy cases) -- re-recording needs live nightly.gcp.forgeops.com
  // access; the credentials in TestConfig.js return 401 against it
  // currently.
  test.skip(`"frodo idm schema object import -o -f ${forgeopsManagedObjectsExportDirectory}/groovy/groovy.managed.json -m forgeops": should refuse to import just the groovy managed object from '${forgeopsManagedObjectsExportDirectory}/groovy/groovy.managed.json' without -y.`, async () => {
    const CMD = `frodo idm schema object import -o -f ${forgeopsManagedObjectsExportDirectory}/groovy/groovy.managed.json -m forgeops`;
    await testFail(CMD, forgeopsEnv);
  });
});
