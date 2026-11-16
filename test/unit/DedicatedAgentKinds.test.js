import { describe, expect, it } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

/**
 * The agent types that the generic `config-manager pull|push oauth2-agents`
 * leaves to a kind of their own (frodo-cli#1249, frodo-cli#1259). The table is
 * written without imports on purpose, so that this test is what keeps it honest:
 * every entry must name a kind that exists, as a `pull` and a `push` command,
 * and the names must be the ones the kinds themselves export.
 */

const leaves = await loadLeafCommands();
const {
  DEDICATED_AGENT_KINDS,
  skippedForDedicatedKind,
  skippedEntriesMessage,
  skippedFilesMessage,
} = await import('../../src/ops/DedicatedAgentKinds.ts');
const { CIMD_PROFILE_AGENT_TYPE, OAUTH_CIMD_PROFILES_KIND, CIMD_PROFILE_KIND } =
  await import('../../src/ops/CIMDProfileConfigOps.ts');
const {
  TRUSTED_JWT_ISSUER_AGENT_TYPE,
  OAUTH_ISSUERS_KIND,
  TRUSTED_JWT_ISSUER_KIND,
} = await import('../../src/ops/OAuth2TrustedJwtIssuerConfigOps.ts');
const {
  SOFTWARE_PUBLISHER_AGENT_TYPE,
  OAUTH_SOFTWARE_PUBLISHERS_KIND,
  SOFTWARE_PUBLISHER_KIND,
} = await import('../../src/ops/SoftwarePublisherConfigOps.ts');

const commandNames = new Set(leaves.map(fullName));

describe('the table of agent types with a kind of their own', () => {
  it('has the three types that have a kind today, and no other', () => {
    expect(Object.keys(DEDICATED_AGENT_KINDS).sort()).toEqual([
      'CIMDProfile',
      'SoftwarePublisher',
      'TrustedJwtIssuer',
    ]);
  });

  it.each(Object.entries(DEDICATED_AGENT_KINDS))(
    'names a kind with a pull and a push command for %s',
    (_agentType, { kind }) => {
      expect(commandNames).toContain(`frodo config-manager pull ${kind}`);
      expect(commandNames).toContain(`frodo config-manager push ${kind}`);
    }
  );

  it('uses the names that the kinds export', () => {
    expect(DEDICATED_AGENT_KINDS[CIMD_PROFILE_AGENT_TYPE].kind).toBe(
      OAUTH_CIMD_PROFILES_KIND
    );
    expect(DEDICATED_AGENT_KINDS[CIMD_PROFILE_AGENT_TYPE].plural).toBe(
      CIMD_PROFILE_KIND.plural
    );
    expect(DEDICATED_AGENT_KINDS[TRUSTED_JWT_ISSUER_AGENT_TYPE].kind).toBe(
      OAUTH_ISSUERS_KIND
    );
    expect(DEDICATED_AGENT_KINDS[TRUSTED_JWT_ISSUER_AGENT_TYPE].plural).toBe(
      TRUSTED_JWT_ISSUER_KIND.plural
    );
    expect(DEDICATED_AGENT_KINDS[SOFTWARE_PUBLISHER_AGENT_TYPE].kind).toBe(
      OAUTH_SOFTWARE_PUBLISHERS_KIND
    );
    expect(DEDICATED_AGENT_KINDS[SOFTWARE_PUBLISHER_AGENT_TYPE].plural).toBe(
      SOFTWARE_PUBLISHER_KIND.plural
    );
  });

  it('is not a table of prototype members: toString and constructor have no kind', () => {
    expect(skippedForDedicatedKind('toString')).toBeUndefined();
    expect(skippedForDedicatedKind('constructor')).toBeUndefined();
    expect(skippedForDedicatedKind('__proto__')).toBeUndefined();
  });

  it.each([
    'OAuth2Client',
    'IdentityGatewayAgent',
    'J2EEAgent',
    'WebAgent',
    '2.2_Agent',
    'SharedAgent',
    'RemoteConsentAgent',
    'AIAgent',
    '',
  ])('leaves %p to the generic kind', (agentType) => {
    expect(skippedForDedicatedKind(agentType)).toBeUndefined();
  });

  it('answers with the name of the kind', () => {
    expect(skippedForDedicatedKind('CIMDProfile')).toBe('oauth-cimd-profiles');
    expect(skippedForDedicatedKind('TrustedJwtIssuer')).toBe('oauth-issuers');
    expect(skippedForDedicatedKind('SoftwarePublisher')).toBe(
      'oauth-software-publishers'
    );
  });
});

describe('the messages', () => {
  it('names the entries and the pull command, once, for several entries', () => {
    expect(
      skippedEntriesMessage('alpha', 'TrustedJwtIssuer', [
        { id: 'testJWT' },
        { id: 'zion-issuer' },
        { id: 'matrix-issuer' },
      ])
    ).toBe(
      `Skipping 3 TrustedJwtIssuer entries of realm 'alpha' (testJWT, zion-issuer, matrix-issuer): ` +
        `trusted JWT issuers are pulled by "frodo config-manager pull oauth-issuers".`
    );
  });

  it('uses the singular for one entry', () => {
    expect(
      skippedEntriesMessage('alpha', 'CIMDProfile', [{ id: 'zion-agents' }])
    ).toBe(
      `Skipping 1 CIMDProfile entry of realm 'alpha' (zion-agents): ` +
        `CIMD profiles are pulled by "frodo config-manager pull oauth-cimd-profiles".`
    );
  });

  it('adds the sentence about overrides only when an entry has them', () => {
    const without = skippedEntriesMessage('alpha', 'CIMDProfile', [
      { id: 'a' },
      { id: 'b' },
    ]);
    const withOverrides = skippedEntriesMessage('alpha', 'CIMDProfile', [
      { id: 'a', overrides: { x: 1 } },
      { id: 'b' },
    ]);
    expect(without).not.toContain('overrides');
    expect(withOverrides).toBe(
      `${without} Their overrides are not applied here: move them to the overrides file of that command (--config-file).`
    );
    expect(
      skippedEntriesMessage('alpha', 'CIMDProfile', [
        { id: 'a', overrides: { x: 1 } },
      ])
    ).toContain(' Its overrides are not applied here');
  });

  it('names the software publishers and their pull command', () => {
    expect(
      skippedEntriesMessage('alpha', 'SoftwarePublisher', [
        { id: 'zion-publisher' },
      ])
    ).toBe(
      `Skipping 1 SoftwarePublisher entry of realm 'alpha' (zion-publisher): ` +
        `software publishers are pulled by "frodo config-manager pull oauth-software-publishers".`
    );
    expect(skippedFilesMessage('bravo', 'SoftwarePublisher', 2)).toBe(
      `Skipping the 2 SoftwarePublisher file(s) of realm 'bravo': ` +
        `they are pushed by "frodo config-manager push oauth-software-publishers".`
    );
  });

  it('counts the files and names the push command', () => {
    expect(skippedFilesMessage('alpha', 'TrustedJwtIssuer', 3)).toBe(
      `Skipping the 3 TrustedJwtIssuer file(s) of realm 'alpha': ` +
        `they are pushed by "frodo config-manager push oauth-issuers".`
    );
    expect(skippedFilesMessage('/', 'CIMDProfile', 1)).toBe(
      `Skipping the 1 CIMDProfile file(s) of realm '/': ` +
        `they are pushed by "frodo config-manager push oauth-cimd-profiles".`
    );
  });
});
