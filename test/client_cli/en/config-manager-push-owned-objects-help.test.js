import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

/**
 * The four standalone push kinds say, in their full help (-hhh), what they leave
 * out in a tree that uses one folder per application (decision record 0042).
 */
const KINDS = [
  ['oauth2-agents', 'OAuth2 clients'],
  ['saml', 'SAML providers'],
  ['connector-definitions', 'connectors'],
  ['connector-mappings', 'mappings'],
];

describe.each(KINDS)("'config-manager push %s' full help", (kind, what) => {
  test(`names ${what} that an application owns and points at 'push applications'`, async () => {
    const { stdout } = await exec(`frodo config-manager push ${kind} -hhh`);
    const text = stdout.replace(/\s+/g, ' ');
    expect(text).toContain(
      `In a tree that uses one folder per application (see frodo config-manager push applications), ${what} that an application owns are not pushed here`
    );
  });
});
