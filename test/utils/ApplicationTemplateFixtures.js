/**
 * A small application template catalog for the tests of `frodo app template`.
 * It has the shapes of the live catalog that the commands must handle, and the
 * odd ones that the library does not check:
 * - a template with several versions and a connector (`azure.ad`, 3.3 and 3.4,
 *   the older one needing an older connector bundle than the newer),
 * - an SSO template with versions (`saml`) and a template with neither a
 *   connector nor `capabilities` (`bookmark`),
 * - a template whose versions are not in the order of their dates (`ldap`),
 *   with a date that is not a date,
 * - an AI target (`ai.target`), whose connector can only read,
 * - a template whose fields have the wrong types (`odd`),
 * - a class name where a connector display name should be (`class.name`),
 * - control characters in a text (`escape`),
 * and, from `poisonFixture`, a copy in which one field of the `saml` template
 * carries an escape sequence, the 8-bit CSI and a bidi override.
 * The entries are made up; they are not copied from the live catalog.
 */

const field = (label, model, required = false, type = 'string') => ({
  label,
  model,
  type,
  ...(required ? { validation: { required: true } } : {}),
});

const property = (nativeName, more = {}) => ({
  nativeName,
  name: nativeName,
  type: 'string',
  ...more,
});

export const fixtureCatalog = {
  AppTemplates: {
    consumer: {
      Saml: {
        '1_2-saml': {
          id: 'saml',
          templateVersion: '1.2',
          displayName: 'SAML',
          templateType: 'SAML',
          dateUpdated: '09-09-2024',
          categories: ['saml'],
          description: 'SAML applications enable single sign-on.',
          supportUrl: 'https://docs.example.com/saml',
          capabilities: { sso: { SAML: true, OIDC: false } },
          sso: { instructions: [], schema: [], defaults: {} },
          clients: ['iOS', 'Android'],
          schema: {
            applicationDetails: [[field('Name', 'name', true)]],
          },
        },
        '1_3-saml': {
          id: 'saml',
          templateVersion: '1.3',
          displayName: 'SAML',
          templateType: 'SAML',
          dateUpdated: '2-5-2026',
          categories: ['saml'],
          description: 'SAML applications enable single sign-on (newer).',
          supportUrl: 'https://docs.example.com/saml',
          capabilities: { sso: { SAML: true, OIDC: false } },
          sso: { instructions: [], schema: [], defaults: {} },
          clients: ['iOS', 'Android', 'React'],
          schema: {
            applicationDetails: [
              [
                field('Name', 'name', true),
                field('Description', 'description'),
              ],
            ],
          },
        },
      },
      Bookmark: {
        '1_0-bookmark': {
          id: 'bookmark',
          templateVersion: '1.0',
          displayName: 'Bookmark',
          templateType: 'Bookmark',
          dateUpdated: '12-09-2025',
          categories: ['bookmark'],
          description: 'A bookmark is a link.',
          supportUrl: 'https://docs.example.com/bookmark',
          schema: { applicationDetails: [[field('Name', 'name', true)]] },
        },
      },
    },
    enterprise: {
      AzureAD: {
        '3_3-azure-ad': {
          id: 'azure.ad',
          templateVersion: '3.3',
          displayName: 'Microsoft Entra',
          templateType: 'Enterprise',
          dateUpdated: '10-03-2024',
          categories: ['Uncategorized'],
          description: 'Reads and provisions Entra.',
          supportUrl: 'https://docs.example.com/entra',
          connectorDisplayName: 'MSGraphAPI Connector',
          connectorName: 'org.example.msgraphapi.MSGraphAPIConnector',
          bundleName: 'org.example.msgraphapi-connector',
          bundleVersion: '[1.5.20.17, 1.6.0.0)',
          capabilities: {
            provisioning: {
              Create: true,
              Read: true,
              Update: true,
              Delete: true,
            },
          },
          connectorTemplate: {
            version: '1.5.20.17',
            pagingType: 'cookie',
            basic: [[field('Tenant', 'tenant', true)]],
            advanced: [[field('Exclude Unmodified', 'excludeUnmodified')]],
          },
          objectTypes: [
            {
              id: '__ACCOUNT__',
              nativeType: '__ACCOUNT__',
              name: 'User',
              managedResource: 'user',
              properties: [
                property('userPrincipalName', { required: true }),
                property('givenName'),
              ],
            },
          ],
          schema: {
            applicationDetails: [[field('Name', 'name', true)]],
            provisioning: { defaultValues: { performHardDelete: true } },
          },
        },
        '3_4-azure-ad': {
          id: 'azure.ad',
          templateVersion: '3.4',
          displayName: 'Microsoft Entra',
          templateType: 'Enterprise',
          dateUpdated: '08-19-2026',
          categories: ['Uncategorized'],
          description: 'Reads and provisions Entra.',
          supportUrl: 'https://docs.example.com/entra',
          connectorDisplayName: 'MSGraphAPI Connector',
          connectorName: 'org.example.msgraphapi.MSGraphAPIConnector',
          bundleName: 'org.example.msgraphapi-connector',
          bundleVersion: '[1.5.20.35, 1.6.0.0)',
          capabilities: {
            provisioning: {
              Create: true,
              Read: true,
              Update: true,
              Delete: true,
            },
          },
          incrementalRecon: {
            propertyName: 'whenChanged',
            comparisonOperator: 'ge',
          },
          connectorTemplate: {
            version: '1.5.20.35',
            pagingType: 'cookie',
            rcsOnly: true,
            prerequisitesTitle: 'Register an app in Entra first',
            basic: [
              [field('Tenant', 'tenant', true)],
              [field('Client Secret', 'clientSecret', false, 'password')],
            ],
            advanced: [[field('Exclude Unmodified', 'excludeUnmodified')]],
          },
          objectTypes: [
            {
              id: '__ACCOUNT__',
              nativeType: '__ACCOUNT__',
              name: 'User',
              managedResource: 'user',
              properties: [
                property('userPrincipalName', { required: true }),
                property('givenName'),
                property('memberOf', {
                  multiValued: true,
                  notCreatable: true,
                  notUpdateable: true,
                }),
              ],
            },
            {
              id: '__GROUP__',
              nativeType: '__GROUP__',
              name: 'Group',
              managedResource: 'assignment',
              properties: [property('displayName', { required: true })],
            },
          ],
          schema: {
            applicationDetails: [
              [
                field('Name', 'name', true),
                field('Description', 'description'),
              ],
            ],
            provisioning: { defaultValues: { performHardDelete: true } },
            // the shape of a section that holds nothing
            nothing: {},
          },
        },
      },
      Ldap: {
        '2_3-ldap': {
          id: 'ldap',
          templateVersion: '2.3',
          displayName: 'LDAP',
          templateType: 'Enterprise',
          dateUpdated: '06-03-2024',
          categories: ['IT infrastructure'],
          connectorDisplayName: 'LDAP Connector',
          connectorName: 'org.example.ldap.LdapConnector',
          bundleVersion: '[1.5.20.11, 1.6.0.0)',
          capabilities: { provisioning: { Create: true, Read: true } },
          connectorTemplate: { version: '1.5.20.11', basic: [], advanced: [] },
        },
        // the newest version has the older date, and a date that is no date
        '2_10-ldap': {
          id: 'ldap',
          templateVersion: '2.10',
          displayName: 'LDAP',
          templateType: 'Enterprise',
          dateUpdated: 'sometime in 2023',
          categories: ['IT infrastructure'],
          connectorDisplayName: 'LDAP Connector',
          connectorName: 'org.example.ldap.LdapConnector',
          bundleVersion: '[1.5.20.11, 1.6.0.0)',
          capabilities: { provisioning: { Create: true, Read: true } },
          connectorTemplate: { version: '1.5.20.11', basic: [], advanced: [] },
        },
      },
      AiTarget: {
        '1_0-ai-target': {
          id: 'ai.target',
          templateVersion: '1.0',
          displayName: 'AI Target (Demo)',
          templateType: 'Enterprise',
          dateUpdated: '05-15-2026',
          categories: ['AI Services'],
          target: true,
          requiresOauthFlow: true,
          connectorDisplayName: 'AI Target Connector',
          connectorName: 'org.example.ai.AiTargetConnector',
          bundleVersion: '[1.5.20.33, 1.6.0.0)',
          capabilities: { provisioning: { Read: true } },
          connectorTemplate: { version: '1.5.20.33', basic: [], advanced: [] },
        },
      },
      ClassName: {
        '1_0-class-name': {
          id: 'class.name',
          templateVersion: '1.0',
          displayName: 'Class Name',
          templateType: 'Enterprise',
          dateUpdated: '01-02-2025',
          categories: ['ERP'],
          connectorDisplayName: 'org.example.epic.ser.SerConnector',
          connectorName: 'org.example.epic.ser.SerConnector',
          connectorTemplate: { version: '1', basic: [], advanced: [] },
        },
      },
      Odd: {
        '1_0-odd': {
          id: 'odd',
          templateVersion: '1.0',
          displayName: 'Odd Fields',
          templateType: 'Enterprise',
          dateUpdated: '13-45-2026',
          categories: 'oops',
          description: 12,
          supportUrl: ['not', 'text'],
          capabilities: [],
          connectorTemplate: 'oops',
          objectTypes: {},
          schema: 5,
          clients: 'iOS',
          incrementalRecon: 'whenChanged',
        },
      },
      Escape: {
        '1_0-escape': {
          id: 'escape',
          templateVersion: '1.0',
          displayName: 'Escape',
          templateType: 'Enterprise',
          dateUpdated: '01-01-2025',
          categories: ['ERP'],
          description: 'before\u001b[31mred\u001b[0m\nafter\u0007',
        },
      },
    },
  },
};

/** The ids the commands print for the fixture catalog, in the order of the list: one per template. */
export const fixtureIds = [
  'ai.target',
  'azure.ad',
  'bookmark',
  'class.name',
  'escape',
  'ldap',
  'odd',
  'saml',
];

/**
 * The versions of a catalog as the library lists them (the same fields, in the
 * order of the name of the template, then of its version): for the tests that
 * replace the library.
 * @param {object} catalog a catalog like `fixtureCatalog`
 * @param {object[]} [tenant] templates the tenant defines itself (see `fixtureTenantTemplates`), merged as the library merges them: one with the id and version of a catalog version replaces it, any other is added
 * @returns {object[]} the versions
 */
export function listItemsOf(catalog, tenant = []) {
  const nameKey = (name) => name.replace(/\./g, '-');
  const compare = (a, b) => {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const difference = (left[i] ?? 0) - (right[i] ?? 0);
      if (difference) return difference;
    }
    return 0;
  };
  const items = [];
  for (const tier of ['consumer', 'enterprise']) {
    for (const [group, templates] of Object.entries(
      catalog.AppTemplates[tier]
    )) {
      for (const [templateId, template] of Object.entries(templates)) {
        items.push({
          templateId,
          name: template.id,
          group,
          tier,
          templateVersion: template.templateVersion,
          displayName: template.displayName,
          templateType: template.templateType,
          dateUpdated: template.dateUpdated,
          isOverride: false,
          newestInGroup: false,
        });
      }
    }
  }
  for (const override of tenant) {
    const templateId = tenantKeyOf(override);
    const sameName = items.find(
      (item) => nameKey(item.name) === nameKey(override.id)
    );
    const custom = {
      templateId,
      name: override.id,
      group: sameName?.group,
      tier: override.templateType === 'Enterprise' ? 'enterprise' : 'consumer',
      templateVersion: override.templateVersion,
      displayName: override.displayName,
      templateType: override.templateType,
      dateUpdated: override.dateUpdated,
      isOverride: true,
      newestInGroup: false,
    };
    const at = items.findIndex((item) => item.templateId === templateId);
    if (at >= 0) items[at] = custom;
    else items.push(custom);
  }
  const newest = new Map();
  for (const item of items) {
    const key = nameKey(item.name);
    if (
      !newest.has(key) ||
      compare(item.templateVersion, newest.get(key)) > 0
    ) {
      newest.set(key, item.templateVersion);
    }
  }
  for (const item of items) {
    item.newestInGroup =
      item.templateVersion === newest.get(nameKey(item.name));
  }
  return items.sort(
    (a, b) =>
      nameKey(a.name).localeCompare(nameKey(b.name)) ||
      compare(a.templateVersion, b.templateVersion)
  );
}

/** The characters no command may print: an escape that starts a color (with its `[31m`), U+009B (the CSI in 8 bits) and U+202E (a bidi override). */
export const POISON = '\u001b[31m\u009b\u202e';

/** What a test looks for in the output: none of the three may be there, nor any other control character except the line break. */
export const UNSAFE_OUTPUT =
  /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

/** The fields of the rows of a list (and of the header of `describe`) that the library hands to the commands without a check. */
export const POISONABLE_FIELDS = [
  'id',
  'displayName',
  'templateVersion',
  'group',
  'templateType',
  'dateUpdated',
];

/**
 * A copy of the fixture catalog in which fields of both versions of the `saml`
 * template carry `POISON`: `id` (the id of the template), `displayName`,
 * `templateVersion`, `templateType`, `dateUpdated`, or the name of the group
 * (the key under which the catalog keeps the template).
 * @param {string | string[]} fields one or more of POISONABLE_FIELDS
 * @returns {object} the catalog
 */
export function poisonFixture(fields) {
  const catalog = structuredClone(fixtureCatalog);
  const consumer = catalog.AppTemplates.consumer;
  const wanted = [].concat(fields);
  for (const field of wanted.filter((candidate) => candidate !== 'group')) {
    for (const entry of Object.values(consumer.Saml)) {
      entry[field] = `${entry[field]}${POISON}`;
    }
  }
  if (wanted.includes('group')) {
    consumer[`Sa${POISON}ml`] = consumer.Saml;
    delete consumer.Saml;
  }
  return catalog;
}

/** The key under which the library lists a template of the tenant: the rule of its getTemplateId. */
const tenantKeyOf = (entry) =>
  `${String(entry.templateVersion).replace(/\./g, '_')}-${String(
    entry.id
  ).replace(/\./g, '-')}`;

/**
 * Templates that a tenant defines itself, as the library reads them from the
 * configuration entities `appTemplate/<id>`:
 * - `ronSoperSpecial`: a template of the tenant's own, with an id that the
 *   catalog does not have (one version, 1.0);
 * - `saml` 1.2: replaces the catalog's version 1.2 of the template (the same
 *   id and version), so the template has a newer version that is the
 *   catalog's;
 * - `azure.ad` 3.5: a version newer than the catalog's newest (3.4), so the
 *   newest version of the template is a custom one and has older versions.
 */
export const fixtureTenantTemplates = [
  {
    _id: 'appTemplate/ronSoperSpecial',
    id: 'ronSoperSpecial',
    templateVersion: '1.0',
    displayName: 'Ron Soper Special',
    templateType: 'Enterprise',
    dateUpdated: '10-5-2023',
    categories: ['Mainframes'],
    description: 'A template of the tenant.',
    connectorDisplayName: 'Ron Connector',
    connectorName: 'org.example.ron.RonConnector',
    bundleVersion: '[1.5.20.11, 1.6.0.0)',
    capabilities: { provisioning: { Create: true, Read: true } },
    connectorTemplate: { version: '1.5.20.11', basic: [], advanced: [] },
  },
  {
    _id: 'appTemplate/saml',
    id: 'saml',
    templateVersion: '1.2',
    displayName: 'SAML',
    templateType: 'SAML',
    dateUpdated: '1-2-2025',
    categories: ['saml'],
    description: 'The tenant replaces the version 1.2 of the catalog.',
    capabilities: { sso: { SAML: true } },
  },
  {
    _id: 'appTemplate/azure.ad',
    id: 'azure.ad',
    templateVersion: '3.5',
    displayName: 'Microsoft Entra',
    templateType: 'Enterprise',
    dateUpdated: '9-1-2026',
    categories: ['Uncategorized'],
    description: 'A newer version than the catalog has.',
    connectorDisplayName: 'MSGraphAPI Connector',
    connectorName: 'org.example.msgraphapi.MSGraphAPIConnector',
    bundleVersion: '[1.5.20.40, 1.6.0.0)',
    capabilities: { provisioning: { Create: true, Read: true } },
    connectorTemplate: { version: '1.5.20.40', basic: [], advanced: [] },
  },
];

/**
 * The entries of the templates of the tenant by the key the library lists them
 * under, for the tests that replace the library.
 * @param {object[]} [tenant] templates of the tenant
 * @returns {Map<string, object>} the entries
 */
export function tenantEntriesOf(tenant = fixtureTenantTemplates) {
  return new Map(tenant.map((entry) => [tenantKeyOf(entry), entry]));
}
