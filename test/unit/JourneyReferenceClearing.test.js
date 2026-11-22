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

const { stored, locations, mode, calls, key, library } =
  createHolderStubs(jest);
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

  test('the rows that clear a reference say how the field holds the name', () => {
    expect(HOLDER_RULES['oauth2-client']).toMatchObject({ shape: 'wrapped' });
    expect(HOLDER_RULES['saml2-provider']).toMatchObject({ shape: 'plain' });
    expect(HOLDER_RULES['ai-agent']).toMatchObject({ shape: 'wrapped' });
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

  /**
   * A provider as AM answers a read of it (the shape of the recorded reads):
   * `_id` is the unpadded base64 of the entity id, there is no location in it,
   * and the service provider holds the sections that its type has. The location is the
   * one of the stub, which the library reads with a query.
   */
  const provider = (location, entityId, serviceProvider) => ({
    _id: Buffer.from(entityId).toString('base64url'),
    _rev: '1',
    entityId,
    serviceProvider,
  });
  const SAML_REMOTE = provider('remote', 'urn:zion:sp', {
    assertionContent: {
      signingAndEncryption: { requestResponseSigning: {} },
      nameIdFormat: {
        nameIdFormatList: [
          'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
        ],
      },
    },
    assertionProcessing: { attributeMapper: { attributeMap: [] } },
    services: { serviceAttributes: {} },
    advanced: {
      idpProxy: {},
      treeConfiguration: { treeName: JOURNEY },
      applicationContext: {},
    },
  });
  const SAML_HOSTED = provider('hosted', 'urn:zion:hosted', {
    assertionContent: { nameIdFormat: { nameIdFormatList: [] } },
    assertionProcessing: {
      attributeMapper: { attributeMap: [] },
      redirectTreeConfiguration: { redirectTreeName: JOURNEY },
      defaultRelayState: '',
    },
    services: { metaAlias: '/zion-hosted', serviceAttributes: {} },
    advanced: { idpProxy: {}, relayStateUrlList: {} },
  });
  const HOSTED_FIELD =
    'serviceProvider.assertionProcessing.redirectTreeConfiguration.redirectTreeName';
  const withoutRevision = ({ _rev, ...rest }) => rest;

  test('saml2-provider (remote): the location comes from the stub of the provider, and the whole provider is written to it, without its revision', async () => {
    stored.set(key('saml', 'urn:zion:sp'), SAML_REMOTE);
    locations.set('urn:zion:sp', 'remote');

    await clearJourneyReference(REFERENCES['saml2-provider'], JOURNEY);

    const cleared = structuredClone(withoutRevision(SAML_REMOTE));
    cleared.serviceProvider.advanced.treeConfiguration.treeName = '[Empty]';
    expect(calls.filter(([type]) => type === 'write')).toEqual([
      ['write', 'saml', 'remote', cleared],
    ]);
    expect(calls.map(([type, holderType]) => `${type} ${holderType}`)).toEqual([
      'read saml-stub',
      'read saml',
      'write saml',
      'read saml',
    ]);
  });

  test('saml2-provider (hosted): the same for a hosted provider, with the plain string in redirectTreeName', async () => {
    stored.set(key('saml', 'urn:zion:hosted'), SAML_HOSTED);
    locations.set('urn:zion:hosted', 'hosted');

    await clearJourneyReference(
      {
        ...REFERENCES['saml2-provider'],
        id: 'urn:zion:hosted',
        from: HOSTED_FIELD,
      },
      JOURNEY
    );

    const cleared = structuredClone(withoutRevision(SAML_HOSTED));
    cleared.serviceProvider.assertionProcessing.redirectTreeConfiguration.redirectTreeName =
      '[Empty]';
    expect(calls.filter(([type]) => type === 'write')).toEqual([
      ['write', 'saml', 'hosted', cleared],
    ]);
  });

  test('saml2-provider: a provider is never written to a location that its read does not say: the read has no entityLocation', async () => {
    // AM's read of a provider has no `entityLocation`; a write that took the
    // location from it would go to `.../saml2/undefined/<id>`, which the stub answers with 404
    expect(SAML_REMOTE).not.toHaveProperty('entityLocation');
    stored.set(key('saml', 'urn:zion:sp'), SAML_REMOTE);
    locations.set('urn:zion:sp', 'remote');

    await expect(
      clearJourneyReference(REFERENCES['saml2-provider'], JOURNEY)
    ).resolves.toEqual({ was: JOURNEY });
    expect(
      calls.filter(([type]) => type === 'write').map((call) => call[2])
    ).toEqual(['remote']);
  });

  const AGENT = {
    _id: 'zion-agent',
    _type: { _id: 'AIAgent', name: 'AI Agent', collection: true },
    advancedOAuth2ClientConfig: {
      treeName: { inherited: false, value: JOURNEY },
    },
    aiAgentIdentityUid: { inherited: false, value: 'uid-1' },
    aiAgentIdentityAttributes: { inherited: false, value: { a: 1 } },
  };
  const clearedAgent = () => ({
    ...AGENT,
    advancedOAuth2ClientConfig: {
      treeName: { inherited: false, value: '[Empty]' },
    },
  });

  test('ai-agent: writes the whole agent as it was read, identity attributes included, with only the wrapped field changed, without the agent identity, and reads it again', async () => {
    stored.set(key('agent', 'zion-agent'), AGENT);

    await clearJourneyReference(REFERENCES['ai-agent'], JOURNEY);

    expect(calls.filter(([type]) => type === 'write')).toEqual([
      ['write', 'agent', 'zion-agent', clearedAgent(), false],
    ]);
    // the agent is read without its identity, before and after
    expect(readAIAgent.mock.calls).toEqual([
      ['zion-agent', false],
      ['zion-agent', false],
    ]);
  });

  test.each([
    ['merge', 'a write that applies what it is sent as a patch'],
    ['replace', 'a write that replaces the object by what it is sent'],
  ])(
    'ai-agent: with %s (%s) the agent reads back cleared and nothing else changed',
    async (value) => {
      mode.value = value;
      stored.set(key('agent', 'zion-agent'), AGENT);

      await expect(
        clearJourneyReference(REFERENCES['ai-agent'], JOURNEY)
      ).resolves.toEqual({ was: JOURNEY });

      mode.value = 'merge';
    }
  );

  describe('a write that changes more than the field', () => {
    /** A write that drops what it does not understand: the agent keeps the cleared field and loses the identity. */
    const damagingWrite = () =>
      updateAIAgent.mockImplementationOnce(async (id, data) => {
        calls.push(['write', 'agent', id, structuredClone(data), false]);
        const { aiAgentIdentityUid, aiAgentIdentityAttributes, ...kept } = data;
        stored.set(key('agent', id), { ...kept, _rev: 'damaged' });
      });

    test('is put back: the original is written again, the fields that had changed are named by their paths, and the journey is not deleted', async () => {
      stored.set(key('agent', 'zion-agent'), AGENT);
      damagingWrite();

      const error = await clearJourneyReference(
        REFERENCES['ai-agent'],
        JOURNEY
      ).catch((caught) => caught);

      expect(error.message).toContain(
        'changed in more than that field: aiAgentIdentityUid, aiAgentIdentityAttributes.'
      );
      expect(error.message).toContain(
        'It was written back as it was before, and the journey is not deleted.'
      );
      // a holder that was put back is not a holder that stays changed
      expect(error.holderChanged).toBe(false);
      // read, cleared write, read back, the original written again, read back
      expect(calls.map(([type]) => type)).toEqual([
        'read',
        'write',
        'read',
        'write',
        'read',
      ]);
      const writes = calls.filter(([type]) => type === 'write');
      expect(writes[1][3]).toEqual(AGENT);
      // the agent is what it was before
      const { _rev, ...after } = stored.get(key('agent', 'zion-agent'));
      expect(after).toEqual(AGENT);
    });

    test('whose restore write fails says so with the reason of the write, names the paths that differ, and says that the holder stays changed', async () => {
      stored.set(key('agent', 'zion-agent'), AGENT);
      updateAIAgent
        .mockImplementationOnce(async (id, data) => {
          calls.push(['write', 'agent', id, structuredClone(data), false]);
          const { aiAgentIdentityUid, ...kept } = data;
          stored.set(key('agent', id), { ...kept, _rev: 'damaged' });
        })
        .mockRejectedValueOnce(new Error('AM said no'));

      const error = await clearJourneyReference(
        REFERENCES['ai-agent'],
        JOURNEY
      ).catch((caught) => caught);

      expect(error.message).toContain(
        'It could NOT be written back as it was before: the write failed (AM said no); it differs from the original in aiAgentIdentityUid.'
      );
      expect(error.message).toContain(
        "The field also stays [Empty]: put the lost attributes back by hand and set the journey 'ZionLogin' in the holder again. The journey is not deleted."
      );
      expect(error.message).not.toContain('(the original values)');
      expect(error.message).not.toContain('never writes');
      expect(error.holderChanged).toBe(true);
    });

    /** A write that is accepted and that cannot carry an attribute: what the library does with an attribute whose name has -encrypted in it. */
    const loseEncrypted = (id, data) => {
      calls.push(['write', 'agent', id, structuredClone(data), false]);
      const { coreOAuth2ClientConfig, ...kept } = data;
      const { 'userpassword-encrypted': lost, ...rest } =
        coreOAuth2ClientConfig;
      stored.set(key('agent', id), {
        ...kept,
        coreOAuth2ClientConfig: rest,
        _rev: 'lossy',
      });
    };
    const withEncrypted = () => ({
      ...AGENT,
      coreOAuth2ClientConfig: {
        'userpassword-encrypted': {
          inherited: false,
          value: 'not-a-real-secret',
        },
        clientName: { inherited: false, value: ['Zion Agent'] },
      },
    });

    test('whose restore write is accepted but whose read still differs says so, says why (the library never writes -encrypted attributes) and what to do, and does not say that the write failed', async () => {
      stored.set(key('agent', 'zion-agent'), withEncrypted());
      // every write loses the attribute, the restore too
      updateAIAgent
        .mockImplementationOnce(async (id, data) => loseEncrypted(id, data))
        .mockImplementationOnce(async (id, data) => loseEncrypted(id, data));

      const error = await clearJourneyReference(
        REFERENCES['ai-agent'],
        JOURNEY
      ).catch((caught) => caught);

      expect(updateAIAgent).toHaveBeenCalledTimes(2);
      expect(error.message).toContain(
        'It could NOT be written back as it was before: the write was accepted, but the holder still differs from the original; it differs from the original in coreOAuth2ClientConfig.userpassword-encrypted.'
      );
      expect(error.message).toContain(
        'The library never writes an attribute whose name has -encrypted in it, so no restore can put it back.'
      );
      expect(error.message).toContain(
        "The field also stays [Empty]: put the lost attributes back by hand and set the journey 'ZionLogin' in the holder again."
      );
      expect(error.message).not.toContain('the write failed');
      expect(error.message).not.toContain('not-a-real-secret');
      expect(error.holderChanged).toBe(true);
    });

    test('whose check read after the restore fails says that, not that the write failed', async () => {
      stored.set(key('agent', 'zion-agent'), AGENT);
      damagingWrite();
      // reads: before, after the cleared write, then the check after the restore
      readAIAgent
        .mockImplementationOnce(readAIAgent.getMockImplementation())
        .mockImplementationOnce(readAIAgent.getMockImplementation())
        .mockRejectedValueOnce(new Error('read refused'));

      const error = await clearJourneyReference(
        REFERENCES['ai-agent'],
        JOURNEY
      ).catch((caught) => caught);

      expect(error.message).toContain(
        'the write was accepted, but the check read after it failed (read refused)'
      );
      expect(error.message).not.toContain('the write failed');
      expect(error.holderChanged).toBe(true);
    });

    test('never prints a value of what changed, whatever the name of the field: paths only', async () => {
      const withValues = {
        ...AGENT,
        coreOAuth2ClientConfig: {
          pin: { inherited: false, value: 'pin-4711' },
          userpassword: { inherited: false, value: 'not-a-real-secret' },
          clientName: { inherited: false, value: ['Zion Agent'] },
        },
      };
      stored.set(key('agent', 'zion-agent'), withValues);
      updateAIAgent.mockImplementationOnce(async (id, data) => {
        calls.push(['write', 'agent', id, structuredClone(data), false]);
        const { coreOAuth2ClientConfig, ...kept } = data;
        stored.set(key('agent', id), {
          ...kept,
          coreOAuth2ClientConfig: {},
          _rev: 'damaged',
        });
      });
      updateAIAgent.mockRejectedValueOnce(new Error('AM said no'));

      const error = await clearJourneyReference(
        REFERENCES['ai-agent'],
        JOURNEY
      ).catch((caught) => caught);

      for (const value of ['pin-4711', 'not-a-real', 'Zion Agent']) {
        expect(error.message).not.toContain(value);
      }
      expect(error.message).toContain(
        'coreOAuth2ClientConfig.pin, coreOAuth2ClientConfig.userpassword, coreOAuth2ClientConfig.clientName'
      );
    });

    test('lists at most twelve paths and counts the rest', async () => {
      const wide = {
        ...AGENT,
        extra: Object.fromEntries(
          Array.from({ length: 15 }, (_, index) => [`f${index}`, 1])
        ),
      };
      stored.set(key('agent', 'zion-agent'), wide);
      updateAIAgent.mockImplementationOnce(async (id, data) => {
        calls.push(['write', 'agent', id, structuredClone(data), false]);
        const { extra, ...kept } = data;
        stored.set(key('agent', id), { ...kept, extra: {}, _rev: 'damaged' });
      });

      const error = await clearJourneyReference(
        REFERENCES['ai-agent'],
        JOURNEY
      ).catch((caught) => caught);

      expect(error.message).toContain('extra.f11, and 3 more.');
      expect(error.message).not.toContain('extra.f12');
    });

    test('a section that is gone is damage too, not the cleared field', async () => {
      stored.set(key('agent', 'zion-agent'), AGENT);
      updateAIAgent.mockImplementationOnce(async (id, data) => {
        calls.push(['write', 'agent', id, structuredClone(data), false]);
        stored.set(key('agent', id), { _id: id, _rev: 'damaged' });
      });

      const error = await clearJourneyReference(
        REFERENCES['ai-agent'],
        JOURNEY
      ).catch((caught) => caught);

      expect(error.message).toContain('changed in more than that field');
      expect(error.message).toContain('advancedOAuth2ClientConfig');
      expect(error.message).toContain('written back as it was before');
      expect(error.holderChanged).toBe(false);
    });

    test('the same for an OAuth2 client: put back, not trusted', async () => {
      stored.set(key('client', 'zion-client'), CLIENT);
      updateOAuth2Client.mockImplementationOnce(async (id, data) => {
        calls.push(['write', 'client', id, structuredClone(data)]);
        const { coreOAuth2ClientConfig, ...kept } = data;
        stored.set(key('client', id), { ...kept, _rev: 'damaged' });
      });

      await expect(
        clearJourneyReference(REFERENCES['oauth2-client'], JOURNEY)
      ).rejects.toThrow(/written back as it was before/);
      const { _rev, ...after } = stored.get(key('client', 'zion-client'));
      expect(after).toEqual(CLIENT);
    });
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

  test('says whether the holder may have been changed: a read that fails after the write does, a write that fails or that changes nothing does not', async () => {
    stored.set(key('client', 'zion-client'), CLIENT);
    readOAuth2Client
      .mockImplementationOnce(readOAuth2Client.getMockImplementation())
      .mockRejectedValueOnce(new Error('read refused'));

    let error = await clearJourneyReference(
      REFERENCES['oauth2-client'],
      JOURNEY
    ).catch((caught) => caught);

    expect(error.message).toContain(
      'was written, but it could not be read again to check it (read refused)'
    );
    expect(error.holderChanged).toBe(true);

    stored.set(key('client', 'zion-client'), CLIENT);
    updateOAuth2Client.mockRejectedValueOnce(new Error('AM said no'));
    error = await clearJourneyReference(
      REFERENCES['oauth2-client'],
      JOURNEY
    ).catch((caught) => caught);
    expect(error.holderChanged).toBeUndefined();

    updateOAuth2Client.mockImplementationOnce(async () => {});
    error = await clearJourneyReference(
      REFERENCES['oauth2-client'],
      JOURNEY
    ).catch((caught) => caught);
    expect(error.message).toContain('still holds the journey name');
    expect(error.holderChanged).toBe(false);
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

  test('a theme whose read after the write fails is flagged as changed', async () => {
    stored.set(key('theme', 'theme-1'), THEME);
    library.theme.readTheme
      .mockImplementationOnce(library.theme.readTheme.getMockImplementation())
      .mockRejectedValueOnce(new Error('read refused'));

    const error = await unlinkJourneyReference(REFERENCES.theme, JOURNEY).catch(
      (caught) => caught
    );

    expect(error.message).toContain(
      'was written, but it could not be read again to check it (read refused)'
    );
    expect(error.holderChanged).toBe(true);
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
