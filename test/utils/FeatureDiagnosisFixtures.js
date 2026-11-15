/**
 * Diagnoses and repair plans in the shape the library 5.0.0-45 returns them
 * (`frodo.cloud.idmFeature.diagnoseIdmFeature`, `planIdmFeatureRepair`,
 * `repairIdmFeature`), built from the finding ids, messages and details its
 * source produces. Sample names only (the realms alpha and bravo).
 */

export const finding = (
  id,
  severity,
  message,
  repairable = false,
  details = {}
) => ({
  id,
  severity,
  message,
  repairable,
  details,
});

const drift = (object, location, cosmeticClass) => ({
  config: 'managed',
  object,
  path: [],
  location,
  kind: 'different',
  cosmetic: true,
  cosmeticClass,
  expected: 'return value;\n',
  actual: 'return value;',
});

/** A tenant with four functional problems (three repairable) and two warnings. */
export const brokenDiagnosis = {
  featureId: 'aiagent',
  supported: true,
  installedVersion: null,
  availableVersions: ['1'],
  findings: [
    finding(
      'registry-not-installed',
      'warning',
      'The registry reports no installed version.',
      false,
      { installedVersion: null, availableVersions: ['1'] }
    ),
    finding(
      'definitions-cosmetic-drift',
      'error',
      '2 definition(s) of the feature differ from the original only cosmetically; that is why the registry reads not installed, and it must not run the enable action until they are aligned.',
      true,
      {
        differences: [
          drift('alpha_aiagent', 'onDelete.source', 'trailing newline'),
          drift('bravo_aiagent', 'onDelete.source', 'trailing newline'),
        ],
      }
    ),
    finding(
      'provider-auth-service-not-set',
      'error',
      'The OAuth 2.0 provider of the realm alpha has no password grant authentication service.',
      true,
      { realm: 'alpha', expected: 'Login' }
    ),
    finding(
      'provider-missing',
      'error',
      'The realm bravo has no OAuth 2.0 provider, so the platform cannot enable AI agents there.',
      true,
      { realm: 'bravo' }
    ),
    finding(
      'gate-closed',
      'error',
      'AM does not accept AI agents in the realm alpha: the agent type is not listed.',
      false,
      { realm: 'alpha' }
    ),
    finding(
      'agents-without-am-entry',
      'warning',
      'IDM holds 4 AI agent object(s) in the realm alpha and AM lists 0.',
      false,
      { realm: 'alpha', idmAgents: 4, amAgents: 0 }
    ),
  ],
};

/** A healthy tenant: only facts. */
export const healthyDiagnosis = {
  featureId: 'aiagent',
  supported: true,
  installedVersion: '1',
  availableVersions: ['1'],
  findings: [
    finding(
      'registry-installed',
      'info',
      'The registry reports version 1 installed.'
    ),
    finding(
      'gate-open',
      'info',
      'AM accepts AI agents in the realm alpha.',
      false,
      {
        realm: 'alpha',
      }
    ),
  ],
};

/** A feature the library cannot diagnose. */
export const unsupportedDiagnosis = {
  featureId: 'groups',
  supported: false,
  installedVersion: '1',
  availableVersions: ['1'],
  findings: [],
};

const step = (id, description, writes, details = {}) => ({
  id,
  description,
  writes,
  details,
  ...(details.realm ? { realm: details.realm } : {}),
});

/** A title that a person changed on purpose: a customization, in the shape of the library's plan and result. */
const titleCustomization = (outcome) => ({
  config: 'managed',
  object: 'alpha_aiagent',
  location: 'schema.title',
  kind: 'changed',
  class: 'title',
  tenantValue: 'Zion Agent',
  originalValue: 'AI Agent',
  outcome,
});

/** White space that the repair normalises, in the shape of the library's plan and result. */
const whitespaceChanges = [
  {
    config: 'managed',
    object: 'alpha_aiagent',
    location: 'onDelete.source',
    kind: 'changed',
    class: 'whitespace',
    tenantValue: 'return value;',
    originalValue: 'return value;\n',
  },
  {
    config: 'managed',
    object: 'bravo_aiagent',
    location: 'onDelete.source',
    kind: 'changed',
    class: 'whitespace',
    originalValue: 'x'.repeat(300),
  },
];

/** The steps of the repair of `brokenDiagnosis`; with `restore` the plan puts the customization back. */
const repairSteps = (restore) => [
  step(
    'create-provider',
    "Create the OAuth 2.0 provider of the realm bravo from the server's template, with the password grant authentication service Login.",
    true,
    { authService: 'Login' }
  ),
  step(
    'set-auth-service',
    'Set the password grant authentication service of the OAuth 2.0 provider of the realm alpha to Login.',
    true,
    { authService: 'Login' }
  ),
  step(
    'align-definitions',
    `Write the original over 3 definition(s) that differ from it (alpha_aiagent onDelete.source; bravo_aiagent onDelete.source; alpha_aiagent schema.title), so that the enable action does not add the feature a second time. 1 of them is a customization (alpha_aiagent schema.title): ${restore ? 'put back at the end' : 'replaced, and it stays replaced'}.`,
    true,
    {
      differences: [
        {
          config: 'managed',
          object: 'alpha_aiagent',
          location: 'onDelete.source',
          expected: 'return value;\n',
          actual: 'return value;',
        },
        {
          config: 'managed',
          object: 'bravo_aiagent',
          location: 'onDelete.source',
          expected: 'x'.repeat(300),
        },
        {
          config: 'managed',
          object: 'alpha_aiagent',
          location: 'schema.title',
          expected: 'AI Agent',
          actual: 'Zion Agent',
        },
      ],
    }
  ),
  step('enable', 'Run the enable action of the environment.', true, {
    realms: ['alpha', 'bravo'],
  }),
  step(
    'wait-for-gate',
    'Wait until AM accepts AI agents in alpha, bravo (only if asked to wait; it can need minutes).',
    false
  ),
  ...(restore
    ? [
        step(
          'restore-definitions',
          'Put the 1 customization(s) back as they were (alpha_aiagent schema.title).',
          true,
          {
            differences: [
              {
                config: 'managed',
                object: 'alpha_aiagent',
                location: 'schema.title',
                expected: 'AI Agent',
                actual: 'Zion Agent',
              },
            ],
          }
        ),
      ]
    : []),
  step('diagnose', 'Diagnose the feature again.', false),
];

/**
 * The repair plan for `brokenDiagnosis` as the library makes it by default (no
 * `restoreCustomizations`): the definitions stay aligned, the title customization is
 * replaced, white space is normalised. With a backup in it.
 */
export const repairPlan = {
  featureId: 'aiagent',
  options: { restoreCustomizations: false, authService: 'Login' },
  diagnosis: brokenDiagnosis,
  repairable: true,
  blockers: [],
  steps: repairSteps(false),
  normalised: whitespaceChanges,
  customizations: [titleCustomization('replaced')],
  backup: {
    feature: { _id: 'aiagent', installedVersion: null },
    managed: { _id: 'managed', objects: [{ name: 'alpha_aiagent' }] },
    repoDs: { _id: 'repo.ds', resourceMapping: {} },
    providers: {
      alpha: { _id: 'oauth-oidc', advancedOAuth2Config: {} },
      bravo: null,
    },
    idmObjects: {
      alpha_aiagent: [{ _id: 'agent-1', name: 'Zion Agent' }],
      alpha_aiagentprivilege: [],
    },
    secretStoreMappings: [
      {
        realm: 'alpha',
        storeId: 'ESV',
        storeTypeId: 'GoogleSecretManagerSecretStoreProvider',
        secretId: 'am.services.oauth2.agent.secret',
        _id: 'mapping-1',
        aliases: ['esv-zion-agent-secret'],
      },
    ],
  },
};

/** The same repair with `restoreCustomizations`: the title customization is put back at the end. */
export const repairPlanRestoring = {
  ...repairPlan,
  options: { restoreCustomizations: true, authService: 'Login' },
  steps: repairSteps(true),
  customizations: [titleCustomization('put-back')],
};

const stepResults = (plan) =>
  plan.steps.map((planned) => ({
    step: planned,
    status: planned.id === 'wait-for-gate' ? 'skipped' : 'done',
    message: `${planned.id} done.`,
  }));

/** What `repairIdmFeature` answers when every step reached its goal. */
export const repairResult = {
  featureId: 'aiagent',
  completed: true,
  results: stepResults(repairPlan),
  normalised: whitespaceChanges,
  customizations: [titleCustomization('replaced')],
  diagnosis: {
    ...brokenDiagnosis,
    findings: [
      finding(
        'gate-closed',
        'error',
        'AM does not accept AI agents in the realm alpha yet.',
        false,
        { realm: 'alpha' }
      ),
    ],
  },
};

/** What `repairIdmFeature` answers for `repairPlanRestoring`. */
export const repairResultRestoring = {
  ...repairResult,
  results: stepResults(repairPlanRestoring),
  customizations: [titleCustomization('put-back')],
};
