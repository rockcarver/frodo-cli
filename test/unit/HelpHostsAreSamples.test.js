import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  fullName,
  loadCommandTree,
  renderFullHelp,
} from '../utils/CommandExamples.js';

const samples = await import('../../src/help/SampleData.ts');

/**
 * Decision record 0039: the help of a command and its usage examples show the
 * values of src/help/SampleData.ts, never a real environment. The full help
 * (`-hhh`) of every command, groups included, is rendered the way the usage
 * examples test renders it, and every host in an http(s) URL must be one of:
 *
 * - a host of a URL constant in SampleData.ts (computed here, so the sample
 *   data stays the one place that names a tenant);
 * - a host that is reserved for examples (`example.com`, `example.org`,
 *   `example.net` and their subdomains) or the local machine;
 * - a host in PLACEHOLDER_HOSTS below: a placeholder, or the public sign-in
 *   host of a service that a documented example talks to, not an environment
 *   of anyone. Add to it only for such a host, with a comment.
 *
 * Names that are not part of a URL (a tenant alias, a user, a company in a file
 * path) cannot be checked here: a deny-list would have to spell them out.
 * Reviewers check them (see the review-a-copilot-pr skill).
 */

const HOW_TO_FIX =
  'Use the sample data in src/help/SampleData.ts for tenants, users and URLs in help text and ' +
  'usage examples (import * as s from the help/SampleData module, as the other commands do). ' +
  'A host that is only a placeholder or a documentation link goes into PLACEHOLDER_HOSTS in ' +
  'test/unit/HelpHostsAreSamples.test.js with a comment saying why it is not an environment.';

/** Hosts that are placeholders or public service hosts, not environments. */
const PLACEHOLDER_HOSTS = [
  // the issuer of the trusted JWT issuer examples
  'my-issuer.com',
  // the public sign-in host of the identity provider in the SAML examples
  'login.microsoftonline.com',
];

const RESERVED_SUFFIXES = ['example.com', 'example.org', 'example.net'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

const URL_HOST = /https?:\/\/([A-Za-z0-9._-]+)/g;
// eslint-disable-next-line no-control-regex -- strips colour codes from rendered help
const ANSI = /\x1b\[[0-9;]*m/g;

function sampleHosts() {
  const hosts = new Set();
  for (const value of Object.values(samples)) {
    if (typeof value !== 'string') continue;
    for (const match of value.matchAll(URL_HOST)) {
      hosts.add(match[1].toLowerCase());
    }
  }
  return hosts;
}

const SAMPLE_HOSTS = sampleHosts();

function isAllowed(host) {
  return (
    SAMPLE_HOSTS.has(host) ||
    PLACEHOLDER_HOSTS.includes(host) ||
    LOCAL_HOSTS.includes(host) ||
    RESERVED_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    )
  );
}

const originalArgv = process.argv;
/** `frodo ...` command name -> the hosts of its rendered full help */
let hostsByCommand = new Map();

beforeAll(async () => {
  // the usage examples and the extra help are only rendered for -hhh
  process.argv = [...originalArgv, '--help-all'];
  const { groups } = await loadCommandTree();
  const commands = [];
  const walk = (command) => {
    commands.push(command);
    command.commands
      .filter((sub) => sub.name() !== 'help')
      .forEach((sub) => walk(sub));
  };
  groups.forEach((group) => walk(group));
  hostsByCommand = new Map(
    commands.map((command) => {
      const text = renderFullHelp(command).replace(ANSI, '');
      const hosts = [...text.matchAll(URL_HOST)].map((m) => m[1].toLowerCase());
      return [fullName(command), hosts];
    })
  );
});

afterAll(() => {
  process.argv = originalArgv;
});

describe('help hosts are samples', () => {
  it('renders the help of the whole command tree and finds the sample hosts in it', () => {
    expect(hostsByCommand.size).toBeGreaterThan(300);
    const found = new Set([...hostsByCommand.values()].flat());
    // anchors: the sample tenants are what the help shows
    expect(found.has('openam-matrix.id.forgerock.io')).toBe(true);
    expect(found.has('openam-zion.id.forgerock.io')).toBe(true);
  });

  it('computes the sample hosts from the sample data', () => {
    expect(SAMPLE_HOSTS.has('openam-matrix.id.forgerock.io')).toBe(true);
    expect(SAMPLE_HOSTS.has('openam-zion.id.forgerock.io')).toBe(true);
  });

  it('shows no host that is not a sample, a reserved example or a listed placeholder', () => {
    const offending = [...hostsByCommand]
      .filter(([, hosts]) => hosts.some((host) => !isAllowed(host)))
      .map(([name]) => name);
    if (offending.length > 0) {
      throw new Error(
        `The help of these commands names a host that is not in the sample data:\n` +
          offending.map((name) => `  ${name}`).join('\n') +
          `\n\nFind it with: frodo <command> -hhh | grep -o 'https\\?://[^ ]*'\n\n${HOW_TO_FIX}`
      );
    }
  });

  it('lists only placeholder hosts that the help still uses, so the list can only shrink', () => {
    const used = new Set([...hostsByCommand.values()].flat());
    const unused = PLACEHOLDER_HOSTS.filter((host) => !used.has(host));
    expect(unused).toEqual([]);
  });
});
