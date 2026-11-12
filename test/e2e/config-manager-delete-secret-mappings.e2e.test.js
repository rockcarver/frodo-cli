/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_REALM=alpha frodo config-manager delete secret-mappings --dry-run -n am.applications.agents.remote.consent.request.signing.ES256
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_REALM=alpha frodo config-manager delete secret-mappings -n am.applications.agents.remote.consent.request.signing.ES256
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete secret-mappings --dry-run
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete secret-mappings -y
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const cloudEnv = getEnv(c);

describe('frodo config-manager delete secret-mappings', () => {
  test(`"frodo config-manager delete secret-mappings --dry-run -n am.applications.agents.remote.consent.request.signing.ES256": should print a dryrun message deleting a secret-mapping by name from cloud."`, async () => {
    const CMD = `frodo config-manager delete secret-mappings --dry-run -n am.applications.agents.remote.consent.request.signing.ES256`;
    await testSuccess(CMD, {
      env: {
        ...cloudEnv.env,
        FRODO_REALM: 'alpha',
      },
    });
  });
  test(`"frodo config-manager delete secret-mappings -n am.applications.agents.remote.consent.request.signing.ES256": should delete a secret by name from cloud."`, async () => {
    const CMD = `frodo config-manager delete secret-mappings -n am.applications.agents.remote.consent.request.signing.ES256`;
    await testSuccess(CMD, {
      env: {
        ...cloudEnv.env,
        FRODO_REALM: 'alpha',
      },
    });
  });
  test(`"frodo config-manager delete secret-mappings --dry-run": should print a dryrun message deleting every secret-mapping from cloud."`, async () => {
    const CMD = `frodo config-manager delete secret-mappings --dry-run`;
    await testSuccess(CMD, cloudEnv)
  });
  test(`"frodo config-manager delete secret-mappings -y": should delete every secret-mapping from cloud"`, async () => {
    const CMD = `frodo config-manager delete secret-mappings -y`;
    await testSuccess(CMD, cloudEnv)
  });
});