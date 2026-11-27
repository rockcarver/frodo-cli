import { describe, expect, it } from '@jest/globals';

/**
 * The split of `config pull|push oauth2-agents` into `oauth-clients` (the OAuth2 clients)
 * and `agents` (every other agent type that has no command of its own): the table that says which
 * of the two handles an agent type. The table is pure and imports nothing but the table of the
 * types that have a command of their own, so that this test keeps it honest: the two families and
 * the three dedicated types partition every type name, and the two families together are what the
 * old command handled. That each family has a `pull` and a `push` command is checked in
 * DedicatedAgentKinds.test.js, next to the table of the types that have a command of their own.
 */

const {
  OAUTH2_CLIENT_AGENT_TYPE,
  familyOfAgentType,
  handlesAgentType,
  skippedForOtherFamily,
  skippedOtherFamilyEntriesMessage,
} = await import('../../src/ops/AgentFamilies.ts');
const { DEDICATED_AGENT_KINDS, skippedForDedicatedKind } =
  await import('../../src/ops/DedicatedAgentKinds.ts');

/** The eight agent types of the `agents` command, as its help lists them. */
const EIGHT = [
  'IdentityGatewayAgent',
  'J2EEAgent',
  'WebAgent',
  '2.2_Agent',
  'SharedAgent',
  'RemoteConsentAgent',
  'SoapSTSAgent',
  'OAuth2Thing',
];
const DEDICATED = ['CIMDProfile', 'TrustedJwtIssuer', 'SoftwarePublisher'];

describe('the family of an agent type', () => {
  it('puts the OAuth2 client, and only it, in oauth-clients', () => {
    expect(OAUTH2_CLIENT_AGENT_TYPE).toBe('OAuth2Client');
    expect(familyOfAgentType('OAuth2Client')).toBe('oauth-clients');
    for (const agentType of EIGHT) {
      expect(familyOfAgentType(agentType)).not.toBe('oauth-clients');
    }
  });

  it.each(EIGHT)('puts %s in agents', (agentType) => {
    expect(familyOfAgentType(agentType)).toBe('agents');
  });

  it.each(DEDICATED)(
    'puts %s in no family: it has a command of its own',
    (agentType) => {
      expect(familyOfAgentType(agentType)).toBeUndefined();
    }
  );

  it.each(['AIAgent', 'SomeFutureAgent', '', '../x', 'a/b', '..'])(
    'puts the other type name %p in agents, as the old command handled it',
    (agentType) => {
      expect(familyOfAgentType(agentType)).toBe('agents');
    }
  );

  it('is not a table of prototype members: toString, constructor and __proto__ are agents', () => {
    for (const agentType of ['toString', 'constructor', '__proto__']) {
      expect(familyOfAgentType(agentType)).toBe('agents');
    }
  });

  it('agrees with the table of the types that have a command of their own, for every one of them', () => {
    for (const agentType of Object.keys(DEDICATED_AGENT_KINDS)) {
      expect(familyOfAgentType(agentType)).toBeUndefined();
      expect(skippedForDedicatedKind(agentType)).toBeDefined();
    }
    expect(Object.keys(DEDICATED_AGENT_KINDS).sort()).toEqual(
      [...DEDICATED].sort()
    );
  });
});

describe('what each choice handles', () => {
  const NINE = ['OAuth2Client', ...EIGHT];

  it('oauth-clients handles the OAuth2 client and nothing else', () => {
    expect(NINE.filter((t) => handlesAgentType('oauth-clients', t))).toEqual([
      'OAuth2Client',
    ]);
  });

  it('agents handles the eight and not the OAuth2 client', () => {
    expect(NINE.filter((t) => handlesAgentType('agents', t))).toEqual(EIGHT);
  });

  it('both is what the old oauth2-agents command handled: every type but the three that have a command of their own', () => {
    expect(NINE.filter((t) => handlesAgentType('both', t))).toEqual(NINE);
    for (const agentType of [...DEDICATED, ...NINE, 'AIAgent', '']) {
      expect(handlesAgentType('both', agentType)).toBe(
        skippedForDedicatedKind(agentType) === undefined
      );
    }
  });

  it('the two families never overlap and together are both', () => {
    for (const agentType of [...NINE, ...DEDICATED, 'AIAgent', '', 'x']) {
      const clients = handlesAgentType('oauth-clients', agentType);
      const agents = handlesAgentType('agents', agentType);
      expect(clients && agents).toBe(false);
      expect(clients || agents).toBe(handlesAgentType('both', agentType));
    }
  });

  it('no choice handles a type that has a command of its own', () => {
    for (const agentType of DEDICATED) {
      for (const choice of ['oauth-clients', 'agents', 'both']) {
        expect(handlesAgentType(choice, agentType)).toBe(false);
      }
    }
  });
});

describe('the command of the other family', () => {
  it('names agents for an agent entry in an oauth-clients file, and oauth-clients for a client entry in an agents file', () => {
    expect(skippedForOtherFamily('oauth-clients', 'WebAgent')).toBe('agents');
    expect(skippedForOtherFamily('agents', 'OAuth2Client')).toBe(
      'oauth-clients'
    );
  });

  it('names none for a type the family handles, for the old command (nothing is skipped) and for a type that has a command of its own', () => {
    expect(
      skippedForOtherFamily('oauth-clients', 'OAuth2Client')
    ).toBeUndefined();
    expect(skippedForOtherFamily('agents', 'WebAgent')).toBeUndefined();
    for (const agentType of ['OAuth2Client', 'WebAgent', 'AIAgent']) {
      expect(skippedForOtherFamily('both', agentType)).toBeUndefined();
    }
    for (const choice of ['oauth-clients', 'agents', 'both']) {
      expect(skippedForOtherFamily(choice, 'CIMDProfile')).toBeUndefined();
    }
  });
});

describe('the warning for an entry of the other family', () => {
  it('names the entries, the realm, the type and the command that pulls them, once for several entries', () => {
    expect(
      skippedOtherFamilyEntriesMessage('alpha', 'OAuth2Client', [
        { id: 'zion-client' },
        { id: 'matrix-client' },
      ])
    ).toBe(
      `Skipping 2 OAuth2Client entries of realm 'alpha' (zion-client, matrix-client): ` +
        `OAuth2 clients are pulled by "frodo config pull oauth-clients".`
    );
  });

  it('uses the singular for one entry and names agents for an agent type', () => {
    expect(
      skippedOtherFamilyEntriesMessage('bravo', 'WebAgent', [{ id: 'my-web' }])
    ).toBe(
      `Skipping 1 WebAgent entry of realm 'bravo' (my-web): ` +
        `agents are pulled by "frodo config pull agents".`
    );
  });

  it('adds the sentence about overrides only when an entry has them', () => {
    const without = skippedOtherFamilyEntriesMessage('alpha', 'SharedAgent', [
      { id: 'a' },
      { id: 'b' },
    ]);
    expect(without).not.toContain('overrides');
    expect(
      skippedOtherFamilyEntriesMessage('alpha', 'SharedAgent', [
        { id: 'a', overrides: { x: 1 } },
        { id: 'b' },
      ])
    ).toBe(
      `${without} Their overrides are not applied here: move them to the overrides file of that command (--config-file).`
    );
    expect(
      skippedOtherFamilyEntriesMessage('alpha', 'OAuth2Client', [
        { id: 'a', overrides: { x: 1 } },
      ])
    ).toContain(' Its overrides are not applied here');
  });

  it('is the same sentence as the one for a type with a command of its own, apart from the words of the family', async () => {
    const { skippedEntriesMessage } =
      await import('../../src/ops/DedicatedAgentKinds.ts');
    const dedicated = skippedEntriesMessage('alpha', 'CIMDProfile', [
      { id: 'a', overrides: { x: 1 } },
    ]);
    const family = skippedOtherFamilyEntriesMessage('alpha', 'WebAgent', [
      { id: 'a', overrides: { x: 1 } },
    ]);
    const shape = (text) =>
      text
        .replace(/CIMDProfile|WebAgent/, 'T')
        .replace(/ [^:]+ are pulled by "[^"]+"/, ' P');
    expect(shape(family)).toBe(shape(dedicated));
  });
});
