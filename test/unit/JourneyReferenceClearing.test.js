import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  createHolderStubs,
  mergePatch,
  SAMPLE_REFERENCES as REFERENCES,
} from '../utils/JourneyHolderStubs.js';

/**
 * The table of `config-manager delete journeys --force`
 * (src/configManagerOps/JourneyReferenceClearing.ts): what is done for a holder
 * that still names the journey, by the `source` of the library's
 * `findJourneyReferences`. One test for every row of the table, for the plan
 * that is built from it, for the words of a holder, and for the exact writes of
 * the rows that clear a holder or remove the journey from a theme.
 *
 * The library is a stub whose read functions answer what Access Management
 * answers (the wrapped shape for OAuth2 clients and AI agents, a plain string
 * for SAML providers) and whose update functions keep what they were sent, so
 * the read after the write shows the result.
 */

const { stored, calls, key, library } = createHolderStubs(jest);
const readOAuth2Client = library.oauth2oidc.client.readOAuth2Client;
const updateOAuth2Client = library.oauth2oidc.client.updateOAuth2Client;
const readSaml2Provider = library.saml2.entityProvider.readSaml2Provider;
const readAIAgent = library.agent.readAIAgent;
const updateAIAgent = library.agent.updateAIAgent;
const updateTheme = library.theme.updateTheme;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: library,
}));

const {
  HOLDER_RULES,
  NO_JOURNEY,
  clearJourneyReference,
  clearPatch,
  describeReference,
  journeyNameAt,
  planJourneyDelete,
  referenceLine,
  setJourneyCleared,
  unlinkJourneyReference,
  unreadableSources,
} = await import('../../src/configManagerOps/JourneyReferenceClearing');

const JOURNEY = 'ZionLogin';

beforeEach(() => {
  stored.clear();
  calls.length = 0;
  jest.clearAllMocks();
});

describe('the table: what --force does for each source of the library', () => {
  // the whole table, so that a changed row shows up here and nowhere by accident
  const EXPECTED = {
    journey: 'leave',
    'authentication-settings': 'leave',
    'self-service-trees': 'leave',
    'oauth2-provider': 'leave',
    'oauth2-client': 'clear',
    'saml2-provider': 'clear',
    'ai-agent': 'clear',
    'agent-group': 'leave',
    'cimd-profile': 'leave',
    theme: 'unlink',
    policy: 'leave',
  };

  test('has a row for every source of the library, and no other', () => {
    expect(Object.keys(HOLDER_RULES).sort()).toEqual(
      Object.keys(REFERENCES).sort()
    );
  });

  test.each(Object.entries(EXPECTED))(
    '%s: --force %ss it',
    (source, action) => {
      expect(HOLDER_RULES[source].action).toBe(action);
    }
  );

  test.each(Object.keys(EXPECTED))(
    '%s: the plan puts the reference where the table says',
    (source) => {
      const reference = REFERENCES[source];

      const plan = planJourneyDelete([reference]);

      const where = { clear: 'clear', unlink: 'unlink', leave: 'dangling' }[
        EXPECTED[source]
      ];
      for (const list of ['clear', 'unlink', 'kept', 'dangling']) {
        expect([list, plan[list]]).toEqual([
          list,
          list === where ? [reference] : [],
        ]);
      }
    }
  );

  test('the rows that clear a reference say how the field holds the name and how it is written', () => {
    expect(HOLDER_RULES['oauth2-client']).toMatchObject({
      shape: 'wrapped',
      write: 'whole',
    });
    expect(HOLDER_RULES['saml2-provider']).toMatchObject({
      shape: 'plain',
      write: 'whole',
    });
    // an AI agent holds its identity too: only the field is sent
    expect(HOLDER_RULES['ai-agent']).toMatchObject({
      shape: 'wrapped',
      write: 'patch',
    });
  });
});

describe('the plan', () => {
  test('--keep-links keeps the theme links and nothing else changes', () => {
    const plan = planJourneyDelete(Object.values(REFERENCES), {
      keepLinks: true,
    });

    expect(plan.unlink).toEqual([]);
    expect(plan.kept).toEqual([REFERENCES.theme]);
    expect(plan.clear.map((r) => r.source)).toEqual([
      'oauth2-client',
      'saml2-provider',
      'ai-agent',
    ]);
  });

  test('a reference that is only inherited is reported and never cleared', () => {
    const inherited = { ...REFERENCES['ai-agent'], inherited: true };

    const plan = planJourneyDelete([inherited, REFERENCES['agent-group']]);

    expect(plan.clear).toEqual([]);
    expect(plan.dangling).toEqual([inherited, REFERENCES['agent-group']]);
  });

  test('plans nothing for no reference', () => {
    expect(planJourneyDelete([])).toEqual({
      clear: [],
      unlink: [],
      kept: [],
      dangling: [],
    });
  });
});

describe('the words of a holder', () => {
  test.each([
    [
      'journey',
      "journey 'Registration' (Zion Login, InnerTreeEvaluatorNode node n-1)",
    ],
    ['authentication-settings', 'authentication settings (core.orgConfig)'],
    ['self-service-trees', 'self-service journey settings (treeMapping)'],
    [
      'oauth2-provider',
      'OAuth2 provider settings (advancedOAuth2Config.passwordGrantAuthService)',
    ],
    [
      'oauth2-client',
      "OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName)",
    ],
    [
      'saml2-provider',
      "SAML provider 'urn:zion:sp' (serviceProvider.advanced.treeConfiguration.treeName)",
    ],
    ['ai-agent', "AI agent 'zion-agent' (advancedOAuth2ClientConfig.treeName)"],
    [
      'agent-group',
      "agent group 'zion-group' (advancedOAuth2ClientConfig.treeName)",
    ],
    [
      'cimd-profile',
      "CIMD profile 'zion-profile' (advancedOAuth2ClientConfig.treeName)",
    ],
    ['theme', "theme 'Zion Theme' (linkedTrees)"],
    [
      'policy',
      "policy 'Zion Policy' of policy set 'zionApplication' (condition.authenticateToService)",
    ],
  ])('%s', (source, words) => {
    expect(describeReference(REFERENCES[source])).toBe(words);
  });

  test('a line carries the dependency of the library', () => {
    expect(referenceLine(REFERENCES.theme)).toBe(
      "theme 'Zion Theme' (linkedTrees), soft"
    );
    expect(referenceLine(REFERENCES['oauth2-client'])).toMatch(/, hard$/);
  });

  test('a holder that inherits the name says so', () => {
    expect(
      describeReference({ ...REFERENCES['ai-agent'], inherited: true })
    ).toContain('inherited from its group');
  });
});

describe('the field of a holder', () => {
  test('is read in the shape that the holder has', () => {
    const wrapped = { a: { b: { inherited: false, value: JOURNEY } } };
    const plain = { a: { b: JOURNEY } };

    expect(journeyNameAt(wrapped, 'a.b', 'wrapped')).toBe(JOURNEY);
    expect(journeyNameAt(plain, 'a.b', 'plain')).toBe(JOURNEY);
    expect(journeyNameAt({ a: null }, 'a.b', 'plain')).toBeUndefined();
    expect(journeyNameAt({}, 'a.b', 'wrapped')).toBeUndefined();
  });

  test('is cleared with the placeholder of Access Management, wrapped or plain, and nothing else is touched', () => {
    const data = {
      a: { b: { inherited: false, value: JOURNEY }, other: 1 },
      keep: true,
    };

    setJourneyCleared(data, 'a.b', 'wrapped');

    expect(NO_JOURNEY).toBe('[Empty]');
    expect(data).toEqual({
      a: { b: { inherited: false, value: '[Empty]' }, other: 1 },
      keep: true,
    });
    const plain = { a: { b: JOURNEY, other: 1 } };
    setJourneyCleared(plain, 'a.b', 'plain');
    expect(plain).toEqual({ a: { b: '[Empty]', other: 1 } });
  });

  test('a patch holds the field and nothing else', () => {
    expect(clearPatch('a.b.c', 'wrapped')).toEqual({
      a: { b: { c: { inherited: false, value: '[Empty]' } } },
    });
    expect(clearPatch('a.b', 'plain')).toEqual({ a: { b: '[Empty]' } });
  });
});

describe('clearing a holder', () => {
  const CLIENT = {
    _id: 'zion-client',
    advancedOAuth2ClientConfig: {
      treeName: { inherited: false, value: JOURNEY },
      grantTypes: { inherited: false, value: ['authorization_code'] },
    },
    coreOAuth2ClientConfig: {
      clientName: { inherited: false, value: ['Zion'] },
    },
  };

  test('oauth2-client: reads the client, writes it whole with the placeholder in the wrapped field, and reads it again', async () => {
    stored.set(key('client', 'zion-client'), CLIENT);

    const change = await clearJourneyReference(
      REFERENCES['oauth2-client'],
      JOURNEY
    );

    expect(change).toEqual({ was: JOURNEY });
    expect(calls.filter(([type]) => type === 'write')).toEqual([
      [
        'write',
        'client',
        'zion-client',
        {
          ...CLIENT,
          advancedOAuth2ClientConfig: {
            ...CLIENT.advancedOAuth2ClientConfig,
            treeName: { inherited: false, value: '[Empty]' },
          },
        },
      ],
    ]);
    // read, write, read back
    expect(calls.map(([type]) => type)).toEqual(['read', 'write', 'read']);
  });

  const SAML_REMOTE = {
    _id: 'dXJuOnppb246c3A',
    entityId: 'urn:zion:sp',
    entityLocation: 'remote',
    serviceProvider: {
      advanced: { treeConfiguration: { treeName: JOURNEY }, other: 1 },
    },
  };
  const SAML_HOSTED = {
    _id: 'aG9zdGVk',
    entityId: 'urn:zion:hosted',
    entityLocation: 'hosted',
    serviceProvider: {
      assertionProcessing: {
        redirectTreeConfiguration: { redirectTreeName: JOURNEY },
      },
    },
  };

  test('saml2-provider (remote): writes the plain string in treeConfiguration.treeName, to the location of the provider', async () => {
    stored.set(key('saml', 'urn:zion:sp'), SAML_REMOTE);

    await clearJourneyReference(REFERENCES['saml2-provider'], JOURNEY);

    expect(calls.filter(([type]) => type === 'write')).toEqual([
      [
        'write',
        'saml',
        'remote',
        {
          ...SAML_REMOTE,
          serviceProvider: {
            advanced: { treeConfiguration: { treeName: '[Empty]' }, other: 1 },
          },
        },
      ],
    ]);
    expect(readSaml2Provider).toHaveBeenCalledWith('urn:zion:sp');
  });

  test('saml2-provider (hosted): writes the plain string in redirectTreeConfiguration.redirectTreeName', async () => {
    stored.set(key('saml', 'urn:zion:hosted'), SAML_HOSTED);

    await clearJourneyReference(
      {
        ...REFERENCES['saml2-provider'],
        id: 'urn:zion:hosted',
        from: 'serviceProvider.assertionProcessing.redirectTreeConfiguration.redirectTreeName',
      },
      JOURNEY
    );

    expect(calls.filter(([type]) => type === 'write')).toEqual([
      [
        'write',
        'saml',
        'hosted',
        {
          ...SAML_HOSTED,
          serviceProvider: {
            assertionProcessing: {
              redirectTreeConfiguration: { redirectTreeName: '[Empty]' },
            },
          },
        },
      ],
    ]);
  });

  const AGENT = {
    _id: 'zion-agent',
    advancedOAuth2ClientConfig: {
      treeName: { inherited: false, value: JOURNEY },
    },
    aiAgentIdentityUid: { inherited: false, value: 'uid-1' },
    aiAgentIdentityAttributes: { inherited: false, value: { a: 1 } },
  };

  test('ai-agent: writes a patch with the wrapped field and nothing else, without the agent identity, and reads the agent again', async () => {
    stored.set(key('agent', 'zion-agent'), AGENT);

    await clearJourneyReference(REFERENCES['ai-agent'], JOURNEY);

    expect(calls.filter(([type]) => type === 'write')).toEqual([
      [
        'write',
        'agent',
        'zion-agent',
        {
          advancedOAuth2ClientConfig: {
            treeName: { inherited: false, value: '[Empty]' },
          },
        },
        false,
      ],
    ]);
    // the agent is read without its identity, before and after
    expect(readAIAgent.mock.calls).toEqual([
      ['zion-agent', false],
      ['zion-agent', false],
    ]);
  });

  test('ai-agent: a write that also changed something else is reported, not trusted', async () => {
    stored.set(key('agent', 'zion-agent'), AGENT);
    updateAIAgent.mockImplementationOnce(async (id, data) => {
      stored.set(
        key('agent', id),
        mergePatch(
          { ...AGENT, aiAgentIdentityUid: { inherited: true } },
          structuredClone(data)
        )
      );
    });

    await expect(
      clearJourneyReference(REFERENCES['ai-agent'], JOURNEY)
    ).rejects.toThrow(/changed in more than that field: aiAgentIdentityUid/);
  });

  test.each([
    ['oauth2-client', CLIENT, 'client', updateOAuth2Client],
    ['ai-agent', AGENT, 'agent', updateAIAgent],
  ])(
    '%s: a holder that does not name the journey any more is not written',
    async (source, data, holderType, update) => {
      stored.set(
        key(holderType, REFERENCES[source].id),
        mergePatch(data, {
          advancedOAuth2ClientConfig: {
            treeName: { inherited: false, value: 'Other' },
          },
        })
      );

      await expect(
        clearJourneyReference(REFERENCES[source], JOURNEY)
      ).rejects.toThrow(/does not name journey 'ZionLogin' any more/);
      expect(update).not.toHaveBeenCalled();
    }
  );

  test('a holder that does not hold the placeholder after the write is a failure', async () => {
    stored.set(key('client', 'zion-client'), CLIENT);
    updateOAuth2Client.mockImplementationOnce(async () => {});

    await expect(
      clearJourneyReference(REFERENCES['oauth2-client'], JOURNEY)
    ).rejects.toThrow(/still holds the journey name after it was cleared/);
  });

  test('a failed read or write is not swallowed', async () => {
    await expect(
      clearJourneyReference(REFERENCES['oauth2-client'], JOURNEY)
    ).rejects.toThrow('no client zion-client');

    stored.set(key('client', 'zion-client'), CLIENT);
    updateOAuth2Client.mockRejectedValueOnce(new Error('AM said no'));

    await expect(
      clearJourneyReference(REFERENCES['oauth2-client'], JOURNEY)
    ).rejects.toThrow('AM said no');
  });
});

describe('removing the journey from a theme', () => {
  const THEME = {
    _id: 'theme-1',
    name: 'Zion Theme',
    isDefault: true,
    linkedTrees: ['Other', JOURNEY, 'Third'],
  };

  test('writes the theme with the journey removed from the list and nothing else changed, and reads it again', async () => {
    stored.set(key('theme', 'theme-1'), THEME);

    const change = await unlinkJourneyReference(REFERENCES.theme, JOURNEY);

    expect(change).toEqual({ was: 'Other, ZionLogin, Third' });
    expect(calls.filter(([type]) => type === 'write')).toEqual([
      [
        'write',
        'theme',
        'theme-1',
        { ...THEME, linkedTrees: ['Other', 'Third'] },
      ],
    ]);
    expect(calls.map(([type]) => type)).toEqual(['read', 'write', 'read']);
  });

  test('a theme that does not link the journey any more is not written', async () => {
    stored.set(key('theme', 'theme-1'), { ...THEME, linkedTrees: ['Other'] });

    await expect(
      unlinkJourneyReference(REFERENCES.theme, JOURNEY)
    ).rejects.toThrow(/does not link journey 'ZionLogin' any more/);
    expect(updateTheme).not.toHaveBeenCalled();
  });

  test('a theme that still links the journey after the write is a failure', async () => {
    stored.set(key('theme', 'theme-1'), THEME);
    updateTheme.mockImplementationOnce(async () => {});

    await expect(
      unlinkJourneyReference(REFERENCES.theme, JOURNEY)
    ).rejects.toThrow(/still links the journey after it was changed/);
  });
});

describe('a lookup that could not read every source', () => {
  test('is named by the sources that failed', () => {
    const error = Object.assign(new Error('Error finding references: x'), {
      originalErrors: [
        new Error('Error reading OAuth2 clients\nsecond line'),
        new Error('Error reading policies'),
      ],
    });

    expect(unreadableSources(error)).toEqual([
      'Error reading OAuth2 clients',
      'Error reading policies',
    ]);
  });

  test('is named by its own message when it nests nothing', () => {
    expect(unreadableSources(new Error('boom\nmore'))).toEqual(['boom']);
    expect(unreadableSources('plain text')).toEqual(['plain text']);
  });
});
