import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

/**
 * The four standalone pull kinds say, in their full help (-hhh), what they leave
 * out in a tree that uses one folder per application (decision record 0042).
 */
const KINDS = [
  ['oauth2-agents', 'OAuth2 clients'],
  ['saml', 'SAML providers'],
  ['connector-definitions', 'connectors'],
  ['connector-mappings', 'mappings'],
];

describe.each(KINDS)("'config-manager pull %s' full help", (kind, what) => {
  test(`names ${what} that an application owns and points at 'pull applications'`, async () => {
    const { stdout } = await exec(`frodo config-manager pull ${kind} -hhh`);
    const text = stdout.replace(/\s+/g, ' ');
    expect(text).toContain(
      `In a tree that uses one folder per application (see frodo config-manager pull applications), ${what} that an application owns are not pulled here`
    );
  });
});
