/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud. Record after config-manager-push-trusted-jwt-issuers and before config-manager-delete-trusted-jwt-issuers:
// the trusted JWT issuer zz-e2e-issuer exists in the alpha realm (see the comment of the push test).
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_NO_UPDATE_CHECK=1 FRODO_REALM=alpha FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=pullOne frodo config-manager pull oauth-issuers -n zz-e2e-issuer -D oauthIssuersTestDir1
*/

import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
  './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pull oauth-issuers', () => {
  test('"frodo config-manager pull oauth-issuers -n zz-e2e-issuer -D oauthIssuersTestDir1": should pull the trusted JWT issuer zz-e2e-issuer of the alpha realm in fr-config-manager style"', async () => {
    const dirName = 'oauthIssuersTestDir1';
    const CMD = `frodo config-manager pull oauth-issuers -n zz-e2e-issuer -D ${dirName}`;
    await testExport(
      CMD,
      { ...env, env: { ...env.env, FRODO_REALM: 'alpha', FRODO_TEST_NAME: 'pullOne' } },
      undefined,
      // exactly one file, and at the path of the kind: realms/<realm>/realm-config/agents/TrustedJwtIssuer/<name>.json
      'realms/alpha/realm-config/agents/TrustedJwtIssuer/zz-e2e-issuer\\.json$',
      dirName,
      false
    );
  });
});
