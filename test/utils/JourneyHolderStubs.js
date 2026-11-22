/**
 * Stand-ins for the library functions that read and update the objects that can
 * name a journey (OAuth2 clients, SAML providers, AI agents, themes), for the
 * tests of `config-manager delete journeys --force`. They keep the objects in
 * memory and answer what Access Management answers: a write of an existing
 * object is a patch (what is sent replaces the fields it holds and the other
 * fields stay), and a theme write replaces the theme. Every call is recorded,
 * in order, as `['read' | 'write', holderType, ...arguments]`.
 */

/** Merges `patch` into `target` the way Access Management applies a write to an existing object. */
export function mergePatch(target, patch) {
  const result = { ...target };
  for (const [name, value] of Object.entries(patch)) {
    result[name] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? mergePatch(target?.[name] ?? {}, value)
        : value;
  }
  return result;
}

/**
 * Creates the stubs.
 * @param {typeof import('@jest/globals').jest} jest the jest object of the test
 * @returns {object} `stored` (a Map from `holderType:id` to the stored object), `calls`, `key(holderType, id)` and `library`: the part of `frodo` that the stubs stand for
 */
export function createHolderStubs(jest) {
  const stored = new Map();
  const calls = [];
  const key = (holderType, id) => `${holderType}:${id}`;
  const copy = (data) => JSON.parse(JSON.stringify(data));

  const reader = (holderType) =>
    jest.fn(async (id, ...rest) => {
      calls.push(['read', holderType, id, ...rest]);
      if (!stored.has(key(holderType, id)))
        throw new Error(`no ${holderType} ${id}`);
      return copy(stored.get(key(holderType, id)));
    });
  const patcher = (holderType) =>
    jest.fn(async (id, data, ...rest) => {
      calls.push(['write', holderType, id, copy(data), ...rest]);
      stored.set(
        key(holderType, id),
        mergePatch(stored.get(key(holderType, id)) ?? {}, copy(data))
      );
    });

  const library = {
    oauth2oidc: {
      client: {
        readOAuth2Client: reader('client'),
        updateOAuth2Client: patcher('client'),
      },
    },
    saml2: {
      entityProvider: {
        readSaml2Provider: reader('saml'),
        // the provider is read by its entity id, written to its location
        updateSaml2Provider: jest.fn(async (location, data) => {
          calls.push(['write', 'saml', location, copy(data)]);
          stored.set(
            key('saml', data.entityId),
            mergePatch(stored.get(key('saml', data.entityId)) ?? {}, copy(data))
          );
        }),
      },
    },
    agent: {
      readAIAgent: reader('agent'),
      updateAIAgent: patcher('agent'),
    },
    theme: {
      readTheme: reader('theme'),
      updateTheme: jest.fn(async (id, data) => {
        calls.push(['write', 'theme', id, copy(data)]);
        stored.set(key('theme', id), copy(data));
      }),
    },
  };
  return { stored, calls, key, library };
}

/** One reference of every source the library reports, as it reports them (sample data: matrix and zion). */
export const SAMPLE_REFERENCES = {
  journey: {
    source: 'journey',
    dependency: 'hard',
    journeyId: 'Registration',
    nodeId: 'n-1',
    nodeType: 'InnerTreeEvaluatorNode',
    nodeDisplayName: 'Zion Login',
  },
  'authentication-settings': {
    source: 'authentication-settings',
    dependency: 'hard',
    from: 'core.orgConfig',
  },
  'self-service-trees': {
    source: 'self-service-trees',
    dependency: 'hard',
    from: 'treeMapping',
  },
  'oauth2-provider': {
    source: 'oauth2-provider',
    dependency: 'hard',
    from: 'advancedOAuth2Config.passwordGrantAuthService',
  },
  'oauth2-client': {
    source: 'oauth2-client',
    dependency: 'hard',
    id: 'zion-client',
    from: 'advancedOAuth2ClientConfig.treeName',
  },
  'saml2-provider': {
    source: 'saml2-provider',
    dependency: 'hard',
    id: 'urn:zion:sp',
    from: 'serviceProvider.advanced.treeConfiguration.treeName',
  },
  'ai-agent': {
    source: 'ai-agent',
    dependency: 'hard',
    id: 'zion-agent',
    from: 'advancedOAuth2ClientConfig.treeName',
  },
  'agent-group': {
    source: 'agent-group',
    dependency: 'hard',
    id: 'zion-group',
    from: 'advancedOAuth2ClientConfig.treeName',
  },
  'cimd-profile': {
    source: 'cimd-profile',
    dependency: 'hard',
    id: 'zion-profile',
    from: 'advancedOAuth2ClientConfig.treeName',
  },
  theme: {
    source: 'theme',
    dependency: 'soft',
    id: 'theme-1',
    name: 'Zion Theme',
    from: 'linkedTrees',
  },
  policy: {
    source: 'policy',
    dependency: 'hard',
    id: 'zion-policy',
    name: 'Zion Policy',
    applicationName: 'zionApplication',
    from: 'condition.authenticateToService',
  },
};
