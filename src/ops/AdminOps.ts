import fs from 'fs';
import {
  frodo,
  FrodoError,
  state,
  type AccessTokenMetaType,
  type AccessTokenResponseType,
  type JwkRsa,
  type JwksInterface,
  type OAuth2ClientSkeleton,
  type OAuth2TrustedJwtIssuerSkeleton,
  type Readable,
  type Writable,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import {
  cleanupProgressIndicators,
  createKeyValueTable,
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';
import GENERIC_EXTENSION_ATTRIBUTES from './templates/GenericExtensionAttributesTemplate.json' with { type: 'json' };
import OAUTH2_CLIENT from './templates/OAuth2ClientTemplate.json' with { type: 'json' };
import { cloneDeep } from './utils/OpsUtils';

const {
  getTypedFilename,
  saveJsonToFile,
  getFilePath,
  getCurrentRealmManagedUser,
} = frodo.utils;
const { get, isEqualJson } = frodo.utils.json;
const {
  generateRfc7523AuthZGrantArtefacts: _generateRfc7523AuthZGrantArtefacts,
  executeRfc7523AuthZGrantFlow: _executeRfc7523AuthZGrantFlow,
} = frodo.admin;
const { stringify } = frodo.utils.json;
const { clientCredentialsGrant } = frodo.oauth2oidc.endpoint;
const { readOAuth2TrustedJwtIssuer } = frodo.oauth2oidc.issuer;
const { readOAuth2Client, readOAuth2Clients, updateOAuth2Client } =
  frodo.oauth2oidc.client;
const { readOAuth2Provider } = frodo.oauth2oidc.provider;
const { readConfigEntity, updateConfigEntity } = frodo.idm.config;
const { getRealmManagedOrganization } = frodo.idm.organization;
const { createSecret } = frodo.cloud.secret;

const protectedClients = ['ui', 'idm-provisioning'];
const protectedSubjects = ['amadmin', 'autoid-resource-server'];

const privilegedScopes = [
  'am-introspect-all-tokens',
  'fr:idm:*',
  'fr:idc:esv:*',
];
// const privilegedUsers = ['openidm-admin'];
const privilegedRoles = [
  'internal/role/openidm-authorized',
  'internal/role/openidm-admin',
];

const adminScopes = ['fr:idm:*', 'fr:idc:esv:*'];
const adminDefaultScopes = ['fr:idm:*'];
const adminRoles = [
  'internal/role/openidm-authorized',
  'internal/role/openidm-admin',
];
const autoIdRoles = [
  'internal/role/platform-provisioning',
  'internal/role/openidm-authorized',
  'internal/role/openidm-admin',
];

/*
 * List all oauth2 clients, which have a corresponding staticUserMapping
 * in the IDM authentication.json:
  {
    "_id": "authentication",
    "rsFilter": {
      ...
      "staticUserMapping": [
        {
          "subject": "someOauth2ClientID",
          "localUser": "internal/user/openidm-admin",
          "userRoles": "authzRoles/*",
          "roles": [
            "internal/role/openidm-authorized",
            "internal/role/openidm-admin"
          ]
        },
        {
          "subject": "RCSClient",
          "localUser": "internal/user/idm-provisioning"
        }
      ]
    }
  }
 */
export async function listOAuth2CustomClients(): Promise<boolean> {
  try {
    const clients = await readOAuth2Clients();
    const clientIds = clients
      .map((client) => client._id)
      .filter((client) => !protectedClients.includes(client));
    const authentication = await readConfigEntity('authentication');
    const subjects = authentication.rsFilter['staticUserMapping']
      .map((mapping) => mapping.subject)
      .filter((subject) => !protectedSubjects.includes(subject));
    const adminClients = subjects.filter((subject) =>
      clientIds.includes(subject)
    );
    adminClients.sort((a, b) => a.localeCompare(b));
    adminClients.forEach((item) => {
      printMessage(`${item}`, 'data');
    });
    return true;
  } catch (error) {
    printError(error, `Error listing custom OAuth2 clients`);
  }
  return false;
}

/*
 * List all oauth2 clients, which have the fr:idm:* scope and a 
 * corresponding staticUserMapping in the IDM authentication.json
 * and are assigned admin privileges:
  {
    "_id": "authentication",
    "rsFilter": {
      ...
      "staticUserMapping": [
        {
          "subject": "someOauth2ClientID",
          "localUser": "internal/user/openidm-admin",
          "userRoles": "authzRoles/*",
          "roles": [
            "internal/role/openidm-authorized",
            "internal/role/openidm-admin"
          ]
        }
      ]
    }
  }
 */
export async function listOAuth2AdminClients(): Promise<boolean> {
  try {
    const clients = await readOAuth2Clients();
    const clientIds = clients
      .filter((client) => {
        // printMessage({ message: client, type: 'error', state });
        let isPrivileged = false;
        if (client.coreOAuth2ClientConfig.scopes) {
          (client.coreOAuth2ClientConfig.scopes as Readable<string[]>).forEach(
            (scope) => {
              if (privilegedScopes.includes(scope)) {
                isPrivileged = true;
              }
            }
          );
        }
        return isPrivileged;
      })
      .map((client) => client._id)
      .filter((clientId) => !protectedClients.includes(clientId));
    const authentication = await readConfigEntity('authentication');
    const subjects = authentication.rsFilter['staticUserMapping']
      .filter((mapping) => {
        let isPrivileged = false;
        if (mapping.roles) {
          mapping.roles.forEach((role) => {
            if (privilegedRoles.includes(role)) {
              isPrivileged = true;
            }
          });
        }
        return isPrivileged;
      })
      .map((mapping) => mapping.subject)
      .filter((subject) => !protectedSubjects.includes(subject));
    const adminClients = subjects.filter((subject) =>
      clientIds.includes(subject)
    );
    adminClients.sort((a, b) => a.localeCompare(b));
    adminClients.forEach((item) => {
      printMessage(`${item}`, 'data');
    });
    return true;
  } catch (error) {
    printError(error, `Error listing admin OAuth2 clients`);
  }
  return false;
}

/*
 * List all static user mappings that are not oauth2 clients in authentication.json
 * and are assigned admin privileges:
  {
    "_id": "authentication",
    "rsFilter": {
      ...
        "staticUserMapping": [
            {
                "subject": "amadmin",
                "localUser": "internal/user/openidm-admin",
                "userRoles": "authzRoles/*",
                "roles": [
                    "internal/role/openidm-authorized",
                    "internal/role/openidm-admin"
                ]
            },
            {
                "subject": "idm-provisioning",
                "localUser": "internal/user/idm-provisioning",
                "roles": [
                    "internal/role/platform-provisioning"
                ]
            },
            {
                "subject": "RCSClient",
                "localUser": "internal/user/idm-provisioning"
            },
            {
                "subject": "autoid-resource-server",
                "localUser": "internal/user/idm-provisioning",
                "roles": [
                    "internal/role/platform-provisioning",
                    "internal/role/openidm-authorized",
                    "internal/role/openidm-admin"
                ]
            }
        ]
    }
  }
 */
export async function listNonOAuth2AdminStaticUserMappings(
  showProtected: boolean
): Promise<boolean> {
  try {
    const clients = await readOAuth2Clients();
    const clientIds = clients
      .map((client) => client._id)
      .filter((client) => !protectedClients.includes(client));
    const authentication = await readConfigEntity('authentication');
    let subjects = authentication.rsFilter['staticUserMapping']
      .filter((mapping) => {
        let isPrivileged = false;
        if (mapping.roles) {
          mapping.roles.forEach((role) => {
            if (privilegedRoles.includes(role)) {
              isPrivileged = true;
            }
          });
        }
        return isPrivileged;
      })
      .map((mapping) => mapping.subject);
    if (!showProtected) {
      subjects = subjects.filter(
        (subject) => !protectedSubjects.includes(subject)
      );
    }
    const adminSubjects = subjects.filter(
      (subject) => !clientIds.includes(subject)
    );
    adminSubjects.sort((a, b) => a.localeCompare(b));
    adminSubjects.forEach((item) => {
      printMessage(`${item}`, 'data');
    });
    return true;
  } catch (error) {
    printError(error, `Error listing non-oauth2 admin static user mappings`);
  }
  return false;
}

async function getDynamicClientRegistrationScope() {
  try {
    const provider = await readOAuth2Provider();
    return provider.clientDynamicRegistrationConfig
      .dynamicClientRegistrationScope;
  } catch (error) {
    throw new FrodoError(
      `Error getting dynamic client registration scope`,
      error
    );
  }
}

async function addAdminScopes(clientId: string, client: OAuth2ClientSkeleton) {
  try {
    const modClient = client;
    const allAdminScopes = adminScopes.concat([
      await getDynamicClientRegistrationScope(),
    ]);
    let addScopes = [];
    if (
      modClient.coreOAuth2ClientConfig.scopes &&
      (modClient.coreOAuth2ClientConfig.scopes as Writable<string[]>).value
    ) {
      addScopes = allAdminScopes.filter((scope) => {
        let add = false;
        if (
          !(
            modClient.coreOAuth2ClientConfig.scopes as Writable<string[]>
          ).value.includes(scope)
        ) {
          add = true;
        }
        return add;
      });
      (modClient.coreOAuth2ClientConfig.scopes as Writable<string[]>).value = (
        modClient.coreOAuth2ClientConfig.scopes as Writable<string[]>
      ).value.concat(addScopes);
    } else {
      (modClient.coreOAuth2ClientConfig.scopes as Writable<string[]>).value =
        allAdminScopes;
    }
    let addDefaultScope = false;
    if (
      modClient.coreOAuth2ClientConfig.defaultScopes &&
      modClient.coreOAuth2ClientConfig.defaultScopes.value
    ) {
      if (modClient.coreOAuth2ClientConfig.defaultScopes.value.length === 0) {
        addDefaultScope = true;
        modClient.coreOAuth2ClientConfig.defaultScopes.value =
          adminDefaultScopes;
      } else {
        printMessage(
          `Client "${clientId}" already has default scopes configured, not adding admin default scope.`
        );
      }
    }
    if (addScopes.length > 0 || addDefaultScope) {
      printMessage(`Adding admin scopes to client "${clientId}"...`);
    } else {
      printMessage(`Client "${clientId}" already has admin scopes.`);
    }
    return modClient;
  } catch (error) {
    throw new FrodoError(
      `Error adding admin scopes to oauth2 client ${clientId}`,
      error
    );
  }
}

function addClientCredentialsGrantType(
  clientId: string,
  client: OAuth2ClientSkeleton
) {
  try {
    const modClient = client;
    let modified = false;
    if (
      modClient.advancedOAuth2ClientConfig.grantTypes &&
      (modClient.advancedOAuth2ClientConfig.grantTypes as Writable<string[]>)
        .value
    ) {
      if (
        !(
          modClient.advancedOAuth2ClientConfig.grantTypes as Writable<string[]>
        ).value.includes('client_credentials')
      ) {
        modified = true;
        (
          modClient.advancedOAuth2ClientConfig.grantTypes as Writable<string[]>
        ).value.push('client_credentials');
      }
    } else {
      (
        modClient.advancedOAuth2ClientConfig.grantTypes as Writable<string[]>
      ).value = ['client_credentials'];
    }
    (
      modClient.advancedOAuth2ClientConfig.grantTypes as Writable<string[]>
    ).inherited = false;
    if (modified) {
      printMessage(
        `Adding client credentials grant type to client "${clientId}"...`
      );
    } else {
      printMessage(
        `Client "${clientId}" already has client credentials grant type.`
      );
    }
    return modClient;
  } catch (error) {
    throw new FrodoError(
      `Error client credentials grant type to oauth2 client ${clientId}`,
      error
    );
  }
}

async function addAdminStaticUserMapping(name: string) {
  try {
    const authentication = await readConfigEntity('authentication');
    let needsAdminMapping = true;
    let addRoles = [];
    const mappings = authentication['rsFilter']['staticUserMapping'].map(
      (mapping) => {
        // ignore mappings for other subjects
        if (mapping.subject !== name) {
          return mapping;
        }
        needsAdminMapping = false;
        addRoles = adminRoles.filter((role) => {
          let add = false;
          if (!mapping.roles.includes(role)) {
            add = true;
          }
          return add;
        });
        const newMapping = mapping;
        newMapping.roles = newMapping.roles.concat(addRoles);
        return newMapping;
      }
    );
    if (needsAdminMapping) {
      printMessage(`Creating static user mapping for client "${name}"...`);
      mappings.push({
        subject: name,
        localUser: 'internal/user/openidm-admin',
        userRoles: 'authzRoles/*',
        roles: adminRoles,
      });
    }
    authentication['rsFilter']['staticUserMapping'] = mappings;
    if (addRoles.length > 0 || needsAdminMapping) {
      printMessage(
        `Adding admin roles to static user mapping for client "${name}"...`
      );
      await updateConfigEntity('authentication', authentication);
    } else {
      printMessage(
        `Static user mapping for client "${name}" already has admin roles.`
      );
    }
  } catch (error) {
    throw new FrodoError(
      `Error adding admin static user mapping to ${name}`,
      error
    );
  }
}

/*
 * Add AutoId static user mapping to authentication.json to enable dashboards and other AutoId-based functionality.
  {
    "_id": "authentication",
    "rsFilter": {
      ...
        "staticUserMapping": [
            ...
            {
                "subject": "autoid-resource-server",
                "localUser": "internal/user/idm-provisioning",
                "roles": [
                    "internal/role/platform-provisioning",
                    "internal/role/openidm-authorized",
                    "internal/role/openidm-admin"
                ]
            }
        ]
    }
  }
 */
export async function addAutoIdStaticUserMapping(): Promise<boolean> {
  const name = 'autoid-resource-server';
  try {
    const authentication = await readConfigEntity('authentication');
    let needsAdminMapping = true;
    let addRoles = [];
    const mappings = authentication.rsFilter['staticUserMapping'].map(
      (mapping) => {
        // ignore mappings for other subjects
        if (mapping.subject !== name) {
          return mapping;
        }
        needsAdminMapping = false;
        addRoles = autoIdRoles.filter((role) => {
          let add = false;
          if (!mapping.roles.includes(role)) {
            add = true;
          }
          return add;
        });
        const newMapping = mapping;
        newMapping.roles = newMapping.roles.concat(addRoles);
        return newMapping;
      }
    );
    if (needsAdminMapping) {
      printMessage(
        `Creating static user mapping for AutoId client "${name}"...`
      );
      mappings.push({
        subject: name,
        localUser: 'internal/user/idm-provisioning',
        userRoles: 'authzRoles/*',
        roles: autoIdRoles,
      });
    }
    authentication.rsFilter['staticUserMapping'] = mappings;
    if (addRoles.length > 0 || needsAdminMapping) {
      printMessage(
        `Adding required roles to static user mapping for AutoId client "${name}"...`
      );
      await updateConfigEntity('authentication', authentication);
      printMessage('Done.');
    } else {
      printMessage(
        `Static user mapping for AutoId client "${name}" already has all required roles.`
      );
    }
    return true;
  } catch (error) {
    printError(
      error,
      `Error adding static user mapping for AutoId oauth2 client ${name}`
    );
  }
  return false;
}

/**
 * Grant an oauth2 client admin privileges: admin scopes and the client credentials grant type on the
 * client, and a static user mapping that maps the client to the admin roles. The mapping is only
 * made when the client was updated: it would otherwise give the admin roles to a client that has
 * no admin scopes, or that does not exist.
 * @param {string} clientId id of the oauth2 client
 * @param {boolean} allowFailures true to report a failed step but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function grantOAuth2ClientAdminPrivileges(
  clientId: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'step', allowFailures });
  await run.run(
    `oauth2 client ${clientId}`,
    async () => {
      let client = await readOAuth2Client(clientId);
      if (
        (client.coreOAuth2ClientConfig.clientName as Readable<string[]>)
          .length === 0
      ) {
        client.coreOAuth2ClientConfig.clientName = {
          inherited: false,
          value: [clientId],
        };
      }
      if (
        client.advancedOAuth2ClientConfig.descriptions.value.length === 0 ||
        client.advancedOAuth2ClientConfig.descriptions.value[0].startsWith(
          'Modified by Frodo'
        ) ||
        client.advancedOAuth2ClientConfig.descriptions.value[0].startsWith(
          'Created by Frodo'
        )
      ) {
        client.advancedOAuth2ClientConfig.descriptions.value = [
          `Modified by Frodo on ${new Date().toLocaleString()}`,
        ];
      }
      client = await addAdminScopes(clientId, client);
      client = addClientCredentialsGrantType(clientId, client);
      await updateOAuth2Client(clientId, client);
    },
    { dependent: true }
  );
  await run.run(`static user mapping ${clientId}`, () =>
    addAdminStaticUserMapping(clientId)
  );
  if (!run.hasFailures) printMessage('Done.');
  return run.finish();
}

async function removeAdminScopes(name: string, client: OAuth2ClientSkeleton) {
  try {
    const modClient = client;
    const allAdminScopes = adminScopes.concat([
      await getDynamicClientRegistrationScope(),
    ]);
    let finalScopes = [];
    if (
      modClient.coreOAuth2ClientConfig.scopes &&
      (modClient.coreOAuth2ClientConfig.scopes as Writable<string[]>).value
    ) {
      finalScopes = (
        modClient.coreOAuth2ClientConfig.scopes as Writable<string[]>
      ).value.filter((scope) => !allAdminScopes.includes(scope));
    }
    if (
      (modClient.coreOAuth2ClientConfig.scopes as Writable<string[]>).value
        .length > finalScopes.length
    ) {
      printMessage(`Removing admin scopes from client "${name}"...`);
      (modClient.coreOAuth2ClientConfig.scopes as Writable<string[]>).value =
        finalScopes;
    } else {
      printMessage(`Client "${name}" has no admin scopes.`);
    }
    let finalDefaultScopes = [];
    if (
      modClient.coreOAuth2ClientConfig.defaultScopes &&
      modClient.coreOAuth2ClientConfig.defaultScopes.value
    ) {
      finalDefaultScopes =
        modClient.coreOAuth2ClientConfig.defaultScopes.value.filter(
          (scope) => !adminDefaultScopes.includes(scope)
        );
    }
    if (
      modClient.coreOAuth2ClientConfig.defaultScopes.value.length >
      finalDefaultScopes.length
    ) {
      printMessage(`Removing admin default scopes from client "${name}"...`);
      modClient.coreOAuth2ClientConfig.defaultScopes.value = finalDefaultScopes;
    } else {
      printMessage(`Client "${name}" has no admin default scopes.`);
    }
    return modClient;
  } catch (error) {
    throw new FrodoError(
      `Error removing admin scopes from oauth2 client ${name}`,
      error
    );
  }
}

function removeClientCredentialsGrantType(
  clientId: string,
  client: OAuth2ClientSkeleton
) {
  try {
    const modClient = client;
    let modified = false;
    let finalGrantTypes = [];
    if (
      modClient.advancedOAuth2ClientConfig.grantTypes &&
      (modClient.advancedOAuth2ClientConfig.grantTypes as Writable<string[]>)
        .value
    ) {
      finalGrantTypes = (
        modClient.advancedOAuth2ClientConfig.grantTypes as Writable<string[]>
      ).value.filter((grantType) => grantType !== 'client_credentials');
      modified =
        (modClient.advancedOAuth2ClientConfig.grantTypes as Writable<string[]>)
          .value.length > finalGrantTypes.length;
    }
    if (modified) {
      printMessage(
        `Removing client credentials grant type from client "${clientId}"...`
      );
      (
        modClient.advancedOAuth2ClientConfig.grantTypes as Writable<string[]>
      ).value = finalGrantTypes;
    } else {
      printMessage(
        `Client "${clientId}" does not allow client credentials grant type.`
      );
    }
    return modClient;
  } catch (error) {
    throw new FrodoError(
      `Error removing client credentials grant type from oauth2 client ${clientId}`,
      error
    );
  }
}

async function removeAdminStaticUserMapping(name: string) {
  try {
    const authentication = await readConfigEntity('authentication');
    let finalRoles = [];
    let removeMapping = false;
    let modified = false;
    const mappings = authentication.rsFilter['staticUserMapping']
      .map((mapping) => {
        // ignore mappings for other subjects
        if (mapping.subject !== name) {
          return mapping;
        }
        finalRoles = mapping.roles.filter((role) => !adminRoles.includes(role));
        const newMapping = mapping;
        removeMapping = finalRoles.length === 0; // if there are no more roles left on this mapping, flag it for removal
        modified = mapping.roles.length > finalRoles.length; // if there were roles removed, set modified flag
        newMapping.roles = finalRoles;
        return newMapping;
      })
      .filter((mapping) => mapping.subject !== name || !removeMapping);
    authentication.rsFilter['staticUserMapping'] = mappings;
    if (modified || removeMapping) {
      if (removeMapping) {
        printMessage(`Removing static user mapping for client "${name}"...`);
      } else {
        printMessage(
          `Removing admin roles from static user mapping for client "${name}"...`
        );
      }
      await updateConfigEntity('authentication', authentication);
    } else {
      printMessage(
        `Static user mapping for client "${name}" has no admin roles.`
      );
    }
  } catch (error) {
    throw new FrodoError(
      `Error removing admin static user mapping for client ${name}`,
      error
    );
  }
}

/**
 * Revoke admin privileges from an oauth2 client: admin scopes and the client credentials grant type
 * on the client, and the admin roles of its static user mapping. The two steps do not depend on each
 * other: a client that cannot be read or updated does not keep its mapping from being removed.
 * @param {string} clientId id of the oauth2 client
 * @param {boolean} allowFailures true to report a failed step but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function revokeOAuth2ClientAdminPrivileges(
  clientId: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'step', allowFailures });
  await run.run(`oauth2 client ${clientId}`, async () => {
    let client = await readOAuth2Client(clientId);
    if (
      (client.coreOAuth2ClientConfig.clientName as Readable<string[]>)
        .length === 0
    ) {
      client.coreOAuth2ClientConfig.clientName = {
        inherited: false,
        value: [clientId],
      };
    }
    if (
      client.advancedOAuth2ClientConfig.descriptions.value.length === 0 ||
      client.advancedOAuth2ClientConfig.descriptions.value[0].startsWith(
        'Modified by Frodo'
      ) ||
      client.advancedOAuth2ClientConfig.descriptions.value[0].startsWith(
        'Created by Frodo'
      )
    ) {
      client.advancedOAuth2ClientConfig.descriptions.value = [
        `Modified by Frodo on ${new Date().toLocaleString()}`,
      ];
    }
    client = await removeAdminScopes(clientId, client);
    client = removeClientCredentialsGrantType(clientId, client);
    await updateOAuth2Client(clientId, client);
  });
  await run.run(`static user mapping ${clientId}`, () =>
    removeAdminStaticUserMapping(clientId)
  );
  if (!run.hasFailures) printMessage('Done.');
  return run.finish();
}

/** What `--llt` asks for: the token that is created for a new client. */
export interface LongLivedTokenRequest {
  /** The scope(s) to request. */
  scope: string;
  /** Name of the secret to store the token in. Omit it to output the token instead. */
  esv?: string;
  /** Token lifetime in seconds. */
  ttl: number;
}

/**
 * Create an oauth2 client with admin privileges and, when asked, a long-lived token for it. The
 * table with the client id and secret is printed as soon as the client exists, whatever happens to
 * the steps after it: a generated secret that was not printed would be lost. The static user
 * mapping is a step the token depends on (a token without it has no admin rights), so a token is
 * only requested after the mapping was made.
 * @param {string} clientId id of the new oauth2 client
 * @param {string} clientSecret secret of the new oauth2 client
 * @param {LongLivedTokenRequest} [longLivedToken] set it to create a long-lived token
 * @param {boolean} allowFailures true to report a failed step but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createOAuth2ClientWithAdminPrivileges(
  clientId: string,
  clientSecret: string,
  longLivedToken?: LongLivedTokenRequest,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'step', allowFailures });
  // The mapping and the token are made for this client: nothing else is attempted without it.
  const created = await run.run(
    `oauth2 client ${clientId}`,
    async () => {
      let client = cloneDeep(OAUTH2_CLIENT);
      client.coreOAuth2ClientConfig.userpassword = clientSecret;
      client.coreOAuth2ClientConfig.clientName.value = [clientId];
      client.advancedOAuth2ClientConfig.descriptions.value = [
        `Created by Frodo on ${new Date().toLocaleString()}`,
      ];
      client = await addAdminScopes(clientId, client);
      await updateOAuth2Client(clientId, client);
    },
    { dependent: true }
  );
  await run.run(
    `static user mapping ${clientId}`,
    () => addAdminStaticUserMapping(clientId),
    { dependent: !!longLivedToken }
  );
  let tokenResponse: lltResponseType;
  if (longLivedToken) {
    await run.run(`long-lived token for ${clientId}`, async () => {
      tokenResponse = await createLongLivedToken(
        clientId,
        clientSecret,
        longLivedToken.scope,
        longLivedToken.esv,
        longLivedToken.ttl
      );
    });
  }
  if (created) {
    if (!run.hasFailures) printMessage('Done.');
    const table = createKeyValueTable();
    table.push([c.heading('Client ID'), clientId]);
    table.push([c.heading('Client Secret'), clientSecret]);
    if (tokenResponse) {
      if (longLivedToken.esv)
        table.push([c.heading('Secret Name'), tokenResponse.secret]);
      table.push([c.heading('Scope'), tokenResponse.scope]);
      table.push([c.heading('Expires'), tokenResponse.expires_on]);
    }
    printMessage(table.toString());
    if (tokenResponse && !longLivedToken.esv) {
      printMessage(`\nBearer token:`, 'info');
      printMessage(`${tokenResponse.access_token}`, 'data');
    }
  }
  return run.finish();
}

export type lltResponseType = Omit<AccessTokenMetaType, 'access_token'> & {
  access_token?: string;
  expires_on: string;
  secret?: string;
};

export async function createLongLivedToken(
  clientId: string,
  clientSecret: string,
  scope: string,
  secret: string,
  lifetime: number
): Promise<lltResponseType> {
  try {
    // get oauth2 client
    const client = await readOAuth2Client(clientId);
    client.userpassword = clientSecret;
    // remember current lifetime
    const rememberedLifetime =
      (client.coreOAuth2ClientConfig.accessTokenLifetime as Writable<number>)
        .value || 3600;
    // set long token lifetime
    client.coreOAuth2ClientConfig.accessTokenLifetime = {
      inherited: false,
      value: lifetime,
    };
    await updateOAuth2Client(clientId, client);
    let tokenResponse: AccessTokenResponseType;
    let grantError: unknown;
    try {
      tokenResponse = await clientCredentialsGrant(
        state.getHost(),
        clientId,
        clientSecret,
        scope
      );
    } catch (error) {
      grantError = error;
    }
    // reset token lifetime, also when the token was not issued: a client that keeps the long
    // lifetime issues every token with it
    client.coreOAuth2ClientConfig.accessTokenLifetime = {
      inherited: false,
      value: rememberedLifetime,
    };
    try {
      await updateOAuth2Client(clientId, client);
    } catch (error) {
      throw new FrodoError(
        `Error resetting the access token lifetime of client ${clientId} to ${rememberedLifetime} seconds, it still issues tokens that live ${lifetime} seconds`,
        grantError ? [grantError as Error, error] : error
      );
    }
    if (grantError) throw grantError;
    const lltResponse: lltResponseType = cloneDeep(tokenResponse);
    // the token is part of the result only when it is not stored in a secret
    if (secret) delete lltResponse.access_token;
    const expires = new Date().getTime() + 1000 * tokenResponse.expires_in;
    lltResponse.expires_on = new Date(expires).toLocaleString();
    // create secret with token as value
    if (secret) {
      const description = 'Long-lived admin token';
      try {
        await createSecret(
          secret as string,
          tokenResponse.access_token,
          description
        );
        lltResponse.secret = secret;
      } catch (error) {
        if (
          get(error, ['response', 'data', 'code']) === 400 &&
          get(error, ['response', 'data', 'message']) ===
            'Failed to create secret, the secret already exists'
        ) {
          const newSecret = `${secret}-${expires}`;
          printMessage(
            `esv '${secret}' already exists, using ${newSecret}`,
            'warn'
          );
          await createSecret(
            newSecret,
            tokenResponse.access_token,
            description
          );
          lltResponse.secret = newSecret;
        } else {
          // a token that is not stored where it was asked to be stored is not a result
          throw error;
        }
      }
    }
    return lltResponse;
  } catch (error) {
    throw new FrodoError(
      `Error creating long-lived token for client ${clientId}`,
      error
    );
  }
}

export async function removeStaticUserMapping(
  subject: string
): Promise<boolean> {
  try {
    const authentication = await readConfigEntity('authentication');
    let removeMapping = false;
    const mappings = authentication.rsFilter['staticUserMapping'].filter(
      (mapping) => {
        // find the subject and flag it
        if (mapping.subject === subject) {
          removeMapping = true;
        }
        // ignore mappings for other subjects
        return mapping.subject !== subject;
      }
    );
    authentication.rsFilter['staticUserMapping'] = mappings;
    if (removeMapping) {
      printMessage(`Removing static user mapping for subject "${subject}"...`);
      await updateConfigEntity('authentication', authentication);
    } else {
      printMessage(`No static user mapping for subject "${subject}" found.`);
    }
    printMessage('Done.');
    return true;
  } catch (error) {
    printError(
      error,
      `Error removing static user mapping for subject ${subject}`
    );
  }
  return false;
}

export async function hideGenericExtensionAttributes(
  includeCustomized: boolean,
  dryRun: boolean
) {
  try {
    const response = await readConfigEntity('managed');
    const managed = cloneDeep(response);
    const updatedObjects = managed.objects.map((object) => {
      // ignore all other objects
      if (object.name !== getCurrentRealmManagedUser()) {
        return object;
      }
      for (const property of Object.keys(
        cloneDeep(GENERIC_EXTENSION_ATTRIBUTES)
      )) {
        if (
          isEqualJson(
            GENERIC_EXTENSION_ATTRIBUTES[property],
            object.schema.properties[property],
            ['viewable', 'usageDescription', 'searchable']
          ) ||
          includeCustomized
        ) {
          if (object.schema.properties[property].viewable) {
            printMessage(`${property}: hide`);

            object.schema.properties[property].viewable = false;
          } else {
            printMessage(`${property}: ignore (already hidden)`);
          }
        } else {
          printMessage(`${property}: skip (customized)`);
        }
      }
      return object;
    });
    managed.objects = updatedObjects;
    if (dryRun) {
      printMessage('Dry-run only. Changes are not saved.');
    } else {
      await updateConfigEntity('managed', managed);
      printMessage('Done.');
    }
    return true;
  } catch (error) {
    printError(error, `Error hiding generic extension attributes`);
  }
  return false;
}

export async function showGenericExtensionAttributes(
  includeCustomized: boolean,
  dryRun: boolean
) {
  try {
    const response = await readConfigEntity('managed');
    const managed = cloneDeep(response);
    const updatedObjects = managed.objects.map((object) => {
      // ignore all other objects
      if (object.name !== getCurrentRealmManagedUser()) {
        return object;
      }
      for (const property of Object.keys(
        cloneDeep(GENERIC_EXTENSION_ATTRIBUTES)
      )) {
        if (
          isEqualJson(
            GENERIC_EXTENSION_ATTRIBUTES[property],
            object.schema.properties[property],
            ['viewable', 'usageDescription']
          ) ||
          includeCustomized
        ) {
          if (!object.schema.properties[property].viewable) {
            printMessage(`${property}: show`);

            object.schema.properties[property].viewable = true;
          } else {
            printMessage(`${property}: ignore (already showing)`);
          }
        } else {
          printMessage(`${property}: skip (customized)`);
        }
      }
      return object;
    });
    managed.objects = updatedObjects;
    if (dryRun) {
      printMessage('Dry-run only. Changes are not saved.');
    } else {
      await updateConfigEntity('managed', managed);
      printMessage('Done.');
    }
    return true;
  } catch (error) {
    printError(error, `Error showing generic extension attributes`);
  }
  return false;
}

async function repairOrgModelUser(dryRun: boolean): Promise<boolean> {
  let repairData = false;
  try {
    const response = await readConfigEntity('managed');
    const managed = cloneDeep(response);
    const RDVPs = ['memberOfOrgIDs'];
    const updatedObjects = managed.objects.map((object) => {
      // ignore all other objects
      if (object.name !== getCurrentRealmManagedUser()) {
        return object;
      }
      printMessage(`${object.name}: checking...`);
      RDVPs.forEach((name) => {
        if (!object.schema.properties[name].queryConfig.flattenProperties) {
          printMessage(`- ${name}: repairing - needs flattening`, 'warn');

          object.schema.properties[name].queryConfig.flattenProperties = true;
          repairData = true;
        } else {
          printMessage(`- ${name}: OK`);
        }
      });
      return object;
    });
    managed.objects = updatedObjects;
    if (!dryRun) {
      await updateConfigEntity('managed', managed);
    }
  } catch (error) {
    throw new FrodoError(`Error repairing org model user`, error);
  }
  return repairData;
}

async function repairOrgModelOrg(dryRun: boolean): Promise<boolean> {
  let repairData = false;
  try {
    const response = await readConfigEntity('managed');
    const managed = cloneDeep(response);
    const RDVPs = [
      'adminIDs',
      'ownerIDs',
      'parentAdminIDs',
      'parentOwnerIDs',
      'parentIDs',
    ];
    const updatedObjects = managed.objects.map((object) => {
      // ignore all other objects
      if (object.name !== getRealmManagedOrganization()) {
        return object;
      }
      printMessage(`${object.name}: checking...`);
      RDVPs.forEach((name) => {
        if (!object.schema.properties[name].queryConfig.flattenProperties) {
          printMessage(`- ${name}: repairing - needs flattening`, 'warn');

          object.schema.properties[name].queryConfig.flattenProperties = true;
          repairData = true;
        } else {
          printMessage(`- ${name}: OK`);
        }
      });
      return object;
    });
    managed.objects = updatedObjects;
    if (!dryRun) {
      await updateConfigEntity('managed', managed);
    }
  } catch (error) {
    throw new FrodoError(`Error repairing org model org`, error);
  }
  return repairData;
}

async function repairOrgModelData(dryRun = false) {
  if (!dryRun) {
    // const rootOrgs = await findRootOrganizations();
  }
}

async function extendOrgModelPermissins(dryRun = false) {
  if (!dryRun) {
    // const rootOrgs = await findRootOrganizations();
  }
}

/**
 * Repair the org model. The user model and the organization model are repaired independently of each
 * other: one that cannot be repaired does not keep the other one from being checked.
 * @param {boolean} excludeCustomized true to exclude customized properties from repair
 * @param {boolean} extendPermissions true to extend permissions to include custom attributes
 * @param {boolean} dryRun true to check only, without saving changes
 * @param {boolean} allowFailures true to report a failed step but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function repairOrgModel(
  excludeCustomized: boolean,
  extendPermissions: boolean,
  dryRun: boolean,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'step', allowFailures });
  let repairData = false;
  // the callbacks return nothing: a returned false would count as a failed step
  await run.run('user model', async () => {
    if (await repairOrgModelUser(dryRun)) repairData = true;
  });
  await run.run('organization model', async () => {
    if (await repairOrgModelOrg(dryRun)) repairData = true;
  });
  if (excludeCustomized) {
    //
  }
  if (repairData) {
    await run.run('data', () => repairOrgModelData(dryRun));
  }
  if (extendPermissions) {
    await run.run('permissions', () => extendOrgModelPermissins(dryRun));
  }
  if (dryRun) {
    printMessage('Dry-run only. Changes are not saved.', 'warn');
  }
  if (!run.hasFailures) printMessage('Done.');
  return run.finish();
}

// Rfc7523 functions

function getJwkFilePath(clientId: string): string {
  return getFilePath(getTypedFilename(clientId + '_private', 'jwk'), true);
}

function getJwksFilePath(clientId: string): string {
  return getFilePath(getTypedFilename(clientId + '_public', 'jwks'), true);
}

/**
 * Generate the artefacts of an RFC7523 authorization grant flow. With `options.save` the library
 * also creates the oauth2 client and the trusted issuer, and the key pair is saved to two files.
 * Nothing is done without the artefacts. The two files are saved independently of each other: a
 * private key that cannot be written does not keep the public key from being written.
 * @param {string} clientId id of the oauth2 client
 * @param {string} iss trusted issuer
 * @param {JwkRsa} [jwk] private key to use instead of generating one
 * @param {string} [sub] subject the trusted issuer is restricted to
 * @param {string[]} [scope] scopes of the oauth2 client
 * @param {{ save: boolean }} [options] `save`: create the client and issuer and save the keys to files
 * @param {boolean} [json] true to output the artefacts as json
 * @param {boolean} allowFailures true to report a failed step but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function generateRfc7523AuthZGrantArtefacts(
  clientId: string,
  iss: string,
  jwk?: JwkRsa,
  sub?: string,
  scope?: string[],
  options?: { save: boolean },
  json?: boolean,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'step', allowFailures });
  let artefacts: {
    jwk: JwkRsa;
    jwks: JwksInterface;
    client: OAuth2ClientSkeleton;
    issuer: OAuth2TrustedJwtIssuerSkeleton;
  };
  const barId = createProgressIndicator(
    'determinate',
    options.save ? 3 : 1,
    'Generating artefacts...'
  );
  const generated = await run.run(
    'artefacts',
    async () => {
      artefacts = await _generateRfc7523AuthZGrantArtefacts(
        clientId,
        iss,
        jwk,
        sub,
        scope,
        options
      );
      updateProgressIndicator(barId, 'Successfully generated artefacts.');
    },
    { dependent: true }
  );
  if (!generated) {
    stopProgressIndicator(barId, 'Error generating artefacts.', 'fail');
    cleanupProgressIndicators();
    if (options.save) {
      // the run has stopped: the summary names these as not attempted
      await run.run('JWK file', () => undefined);
      await run.run('JWKS file', () => undefined);
    }
    return run.finish();
  }
  let jwksFile: string;
  if (options.save) {
    const jwkBarId = createProgressIndicator(
      'determinate',
      1,
      'Saving JWK (private key)...'
    );
    const jwkSaved = await run.run('JWK file', () => {
      const file = getJwkFilePath(clientId);
      saveJsonToFile(artefacts.jwk, file, false);
      updateProgressIndicator(jwkBarId, `Saved JWK to ${file}.`);
      updateProgressIndicator(barId, 'Successfully saved JWK (private key).');
    });
    if (jwkSaved) stopProgressIndicator(jwkBarId);
    else stopProgressIndicator(jwkBarId, 'Error saving JWK.', 'fail');
    const jwksBarId = createProgressIndicator(
      'determinate',
      1,
      'Saving JWKS (public key)...'
    );
    const jwksSaved = await run.run('JWKS file', () => {
      const file = getJwksFilePath(clientId);
      saveJsonToFile(artefacts.jwks, file, false);
      jwksFile = file;
      updateProgressIndicator(jwksBarId, `Saved JWKS to ${file}.`);
      updateProgressIndicator(barId, 'Successfully saved JWKS (public key).');
    });
    if (jwksSaved) stopProgressIndicator(jwksBarId);
    else stopProgressIndicator(jwksBarId, 'Error saving JWKS.', 'fail');
  }
  if (run.hasFailures) {
    stopProgressIndicator(
      barId,
      'Generated artefacts, but could not save all of them.',
      'fail'
    );
  } else {
    stopProgressIndicator(
      barId,
      `Successfully generated ${
        options.save ? 'and saved artefacts' : 'artefacts'
      }.`
    );
  }
  cleanupProgressIndicators();
  const jwksLocation = options.save ? (jwksFile ?? 'Not saved') : 'See below';
  try {
    if (json) {
      printMessage(artefacts, 'data');
    } else {
      printMessage(
        options.save
          ? `\nCreated oauth2 client in the ${state.getRealm()} realm:`
          : `\nIn AM, create an OAuth2 client in the ${state.getRealm()} realm with the following information:`
      );
      const client = createKeyValueTable();
      client.push([c.heading('Client ID'), clientId]);
      client.push([c.heading('Client Name'), clientId]);
      client.push([
        c.heading('Scopes'),
        (
          artefacts.client.coreOAuth2ClientConfig.scopes as Writable<string[]>
        ).value.join(', '),
      ]);
      client.push([
        c.heading('Client Type'),
        (artefacts.client.coreOAuth2ClientConfig.clientType as Writable<string>)
          .value,
      ]);
      client.push([
        c.heading('Grant Types'),
        (
          artefacts.client.advancedOAuth2ClientConfig.grantTypes as Writable<
            string[]
          >
        ).value.join(', '),
      ]);
      client.push([
        c.heading('Implied Consent'),
        (
          artefacts.client.advancedOAuth2ClientConfig
            .isConsentImplied as Writable<boolean>
        ).value,
      ]);
      client.push([
        c.heading('Token Endpoint Authentication '),
        (
          artefacts.client.advancedOAuth2ClientConfig
            .tokenEndpointAuthMethod as Writable<string>
        ).value,
      ]);
      client.push([
        c.heading('Public Key Selector'),
        (
          artefacts.client.signEncOAuth2ClientConfig
            .publicKeyLocation as Writable<string>
        ).value,
      ]);
      client.push([c.heading('JWKS (Public Key)'), jwksLocation]);
      printMessage(`\n${client.toString()}`);

      printMessage(
        options.save
          ? `\nCreated oauth2 trusted issuer in the ${state.getRealm()} realm:`
          : `\nIn AM, create a trusted issuer in the ${state.getRealm()} realm with the following information:`
      );
      const issuer = createKeyValueTable();
      issuer.push([c.heading('Name'), artefacts.issuer._id]);
      issuer.push([
        c.heading('JWT Issuer'),
        (artefacts.issuer.issuer as Writable<string>).value,
      ]);
      issuer.push([
        c.heading('Allowed Subjects              '),
        (artefacts.issuer.allowedSubjects as Writable<string[]>)?.value.length
          ? (
              artefacts.issuer.allowedSubjects as Writable<string[]>
            )?.value.join(', ')
          : `Any ${state.getRealm()} realm user`,
      ]);
      issuer.push([c.heading('JWKS (Public Key)'), jwksLocation]);
      printMessage(`\n${issuer.toString()}`);
      if (!options.save) {
        printMessage(c.command('\nJWK (Private Key)'));
        printMessage(stringify(artefacts.jwk));
        printMessage(c.command('\nJWKS (Public Key)'));
        printMessage(stringify(artefacts.jwks));
      }
    }
  } catch (error) {
    printError(error);
    run.recordFailure('report', error);
  }
  return run.finish();
}

export async function executeRfc7523AuthZGrantFlow(
  clientId: string,
  iss?: string,
  jwk?: JwkRsa,
  sub?: string,
  scope?: string[],
  json?: boolean
): Promise<boolean> {
  let tokenResponse: AccessTokenResponseType;
  let spinnerId: string;
  try {
    // The flow needs an issuer, a private key and a subject. Each comes from
    // its option or from the artefacts that
    // `generate-rfc7523-authz-grant-artefacts` created. One that cannot be
    // found is reported and the run stops before anything is sent: AM would
    // only answer that a claim is missing (cli#1001).
    const missing: string[] = [];
    const issuerId = `${clientId}-issuer`;
    let issuer: OAuth2TrustedJwtIssuerSkeleton;
    let issuerError: string;
    const readIssuer = async () => {
      if (issuer || issuerError) return;
      try {
        issuer = await readOAuth2TrustedJwtIssuer(issuerId);
      } catch (error) {
        issuerError = error.message;
      }
    };

    if (!iss) {
      const issSpinnerId = createProgressIndicator(
        'indeterminate',
        0,
        'No issuer provided, attempting to find suitable issuer...'
      );
      await readIssuer();
      iss = (issuer?.issuer as Writable<string>)?.value;
      if (iss) {
        stopProgressIndicator(
          issSpinnerId,
          `Found suitable issuer: ${issuerId} - ${iss}`,
          'success'
        );
      } else {
        missing.push('--iss');
        stopProgressIndicator(
          issSpinnerId,
          issuer
            ? `No issuer provided and the trusted issuer ${issuerId} has no issuer value, so it can match no assertion. Create it again with 'frodo admin generate-rfc7523-authz-grant-artefacts --iss'.`
            : `No issuer provided and no suitable issuer could be found: ${issuerError}`,
          'fail'
        );
      }
    }

    if (!jwk) {
      const jwkSpinnerId = createProgressIndicator(
        'indeterminate',
        0,
        'No JWK provided, attempting to locate a suitable JWK...'
      );
      try {
        jwk = JSON.parse(fs.readFileSync(getJwkFilePath(clientId), 'utf8'));
        stopProgressIndicator(
          jwkSpinnerId,
          `Loaded private key JWK from: ${getJwkFilePath(clientId)}`,
          'success'
        );
      } catch (error) {
        missing.push('--jwk-file');
        stopProgressIndicator(
          jwkSpinnerId,
          `No JWK provided and no suitable JWK could be loaded from file: ${error.message}`,
          'fail'
        );
      }
    }

    if (!sub) {
      const subSpinnerId = createProgressIndicator(
        'indeterminate',
        0,
        'No subject provided, attempting to find one in the trusted issuer...'
      );
      await readIssuer();
      const allowedSubjects =
        (issuer?.allowedSubjects as Writable<string[]>)?.value ?? [];
      // One allowed subject is no choice. Several, or any user, need a
      // decision that only the person running the flow can make.
      if (allowedSubjects.length === 1) {
        sub = allowedSubjects[0];
        stopProgressIndicator(
          subSpinnerId,
          `Using the trusted issuer's only allowed subject: ${sub}`,
          'success'
        );
      } else {
        missing.push('--sub');
        stopProgressIndicator(
          subSpinnerId,
          !issuer
            ? `No subject provided and no suitable subject could be extracted from the trusted issuer configuration: ${issuerError}`
            : allowedSubjects.length
              ? `No subject provided, and the trusted issuer allows ${allowedSubjects.length} subjects (${allowedSubjects.join(', ')}). Name one with --sub.`
              : `No subject provided, and the trusted issuer allows any realm user, so there is none to pick. Name the user to act as with --sub.`,
          'fail'
        );
      }
    }

    if (missing.length) {
      printMessage(
        `Nothing was sent. No value for ${missing.join(', ')}: give ${
          missing.length > 1 ? 'them' : 'it'
        } on the command line.`,
        'error'
      );
      return false;
    }

    // we got everything we need, let's get that token
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      'Executing rfc7523 authz grant flow...'
    );
    tokenResponse = await _executeRfc7523AuthZGrantFlow(
      clientId,
      iss,
      jwk,
      sub,
      scope
    );
    stopProgressIndicator(
      spinnerId,
      'Successfully executed rfc7523 authz grant flow.',
      'success'
    );
  } catch (error) {
    // The library error carries AM's answer (error and description) in its
    // nested errors; printError shows them.
    if (spinnerId) {
      stopProgressIndicator(
        spinnerId,
        'Error executing rfc7523 authz grant flow.',
        'fail'
      );
    }
    printError(error);
    return false;
  }
  cleanupProgressIndicators();

  if (json) {
    printMessage(tokenResponse, 'data');
  } else {
    printMessage(c.command('\nAccess Token'));
    printMessage(tokenResponse.access_token);
    if (tokenResponse.id_token) {
      printMessage(c.command('\nIdentity Token'));
      printMessage(tokenResponse.id_token);
    }
  }
  return true;
}
