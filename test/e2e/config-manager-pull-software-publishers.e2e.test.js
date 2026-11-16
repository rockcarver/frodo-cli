/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud. Record after config-manager-push-software-publishers and before config-manager-delete-software-publishers:
// the software publisher zz-e2e-publisher exists in the alpha realm (see the comment of the push test).
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_NO_UPDATE_CHECK=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=pullOne frodo config-manager pull oauth-software-publishers -n zz-e2e-publisher -D softwarePublishersTestDir1
*/

import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pull oauth-software-publishers', () => {
  test('"frodo config-manager pull oauth-software-publishers -n zz-e2e-publisher -D softwarePublishersTestDir1": should pull the software publisher zz-e2e-publisher of the alpha realm in fr-config-manager style"', async () => {
    const dirName = 'softwarePublishersTestDir1';
    const CMD = `frodo config-manager pull oauth-software-publishers -n zz-e2e-publisher -D ${dirName}`;
    await testExport(
      CMD,
      { ...env, env: { ...env.env, FRODO_REALM: 'alpha', FRODO_TEST_NAME: 'pullOne' } },
      undefined,
      // exactly one file, and at the path of the kind: realms/<realm>/realm-config/agents/SoftwarePublisher/<name>.json
      'realms/alpha/realm-config/agents/SoftwarePublisher/zz-e2e-publisher\\.json$',
      dirName,
      false
    );
  });
});
