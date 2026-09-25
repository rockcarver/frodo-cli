/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push config-metadata --metadata.pushedAt 2023-09-10T10:21:46Z --metadata.versionInfo.version 1.0 --metadata.versionInfo.stable true --metadata.versionInfo.rev 0675342640420f7ff6635d6a63d2c9c81b6feca7 -m forgeops
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://nightly.gcp.forgeops.com/am frodo config-manager push config-metadata -M.two 2 -M.true true -M.true2 -M.true3 -M.true3 three -M.obj.one 1 -M.obj.two -M.obj2.obj3.msg hello -m forgeops
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { forgeops_connection as fc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const forgeopsEnv = getEnv(fc);

const metadataArgs = [
  '--metadata.pushedAt 2023-09-10T10:21:46Z',
  '--metadata.versionInfo.version 1.0',
  '--metadata.versionInfo.stable true',
  '--metadata.versionInfo.rev 0675342640420f7ff6635d6a63d2c9c81b6feca7',
].join(' ');
const dotNotationArgs = [
  '-M.two 2',
  '-M.true true',
  '-M.true2',
  '-M.true3',
  '-M.true3 three',
  '-M.obj.one 1',
  '-M.obj.two',
  '-M.obj2.obj3.msg hello',
].join(' ');

describe('frodo config-manager push config-metadata', () => {
    test(`"frodo config-manager push config-metadata ${metadataArgs} -m forgeops": should import config-metadata into forgeops"`, async () => {
        const CMD = `frodo config-manager push config-metadata ${metadataArgs} -m forgeops `;
        await testSuccess(CMD, forgeopsEnv);
    });
    test(`"frodo config-manager push config-metadata ${dotNotationArgs} -m forgeops": should correctly parse dot-notation options (string values, boolean defaults, duplicate-path arrays, and nested objects) and import config-metadata into forgeops"`, async () => {
        const CMD = `frodo config-manager push config-metadata ${dotNotationArgs} -m forgeops `;
        await testSuccess(CMD, forgeopsEnv);
  });
});
