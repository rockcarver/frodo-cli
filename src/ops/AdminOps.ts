import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { Readable, Writable } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { OAuth2ClientSkeleton } from '@rockcarver/frodo-lib/types/api/OAuth2ClientApi';
import { AccessTokenResponseType } from '@rockcarver/frodo-lib/types/api/OAuth2OIDCApi';
import { OAuth2TrustedJwtIssuerSkeleton } from '@rockcarver/frodo-lib/types/api/OAuth2TrustedJwtIssuerApi';
import { JwkRsa, JwksInterface } from '@rockcarver/frodo-lib/types/ops/JoseOps';
import { AccessTokenMetaType } from '@rockcarver/frodo-lib/types/ops/OAuth2OidcOps';
import fs from 'fs';

import {
  cleanupProgressIndicators,
  createKeyValueTable,
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import GENERIC_EXTENSION_ATTRIBUTES from './templates/GenericExtensionAttributesTemplate.json';
import OAUTH2_CLIENT from './templates/OAuth2ClientTemplate.json';
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

export async function grantOAuth2ClientAdminPrivileges(
  clientId: string
): Promise<boolean> {
  try {
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
    await addAdminStaticUserMapping(clientId);
    printMessage('Done.');
    return true;
  } catch (error) {
    printError(
      error,
      `Error granting oauth2 client ${clientId} admin privileges`
    );
  }
  return false;
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

export async function revokeOAuth2ClientAdminPrivileges(
  clientId: string
): Promise<boolean> {
  try {
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
    await removeAdminStaticUserMapping(clientId);
    printMessage('Done.');
    return true;
  } catch (error) {
    printError(
      error,
      `Error revoking oauth2 client ${clientId} admin privileges`
    );
  }
  return false;
}

export async function createOAuth2ClientWithAdminPrivileges(
  clientId: string,
  clientSecret: string
): Promise<boolean> {
  try {
    let client = cloneDeep(OAUTH2_CLIENT);
    client.coreOAuth2ClientConfig.userpassword = clientSecret;
    client.coreOAuth2ClientConfig.clientName.value = [clientId];
    client.advancedOAuth2ClientConfig.descriptions.value = [
      `Created by Frodo on ${new Date().toLocaleString()}`,
    ];
    client = await addAdminScopes(clientId, client);
    await updateOAuth2Client(clientId, client);
    await addAdminStaticUserMapping(clientId);
    printMessage('Done.');
    return true;
  } catch (error) {
    printError(
      error,
      `Error creating oauth2 client ${clientId} with admin privileges`
    );
  }
  return false;
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
    const tokenResponse = await clientCredentialsGrant(
      state.getHost(),
      clientId,
      clientSecret,
      scope
    );
    const lltResponse: lltResponseType = cloneDeep(tokenResponse);
    delete lltResponse.access_token;
    const expires = new Date().getTime() + 1000 * tokenResponse.expires_in;
    lltResponse.expires_on = new Date(expires).toLocaleString();
    // reset token lifetime
    client.coreOAuth2ClientConfig.accessTokenLifetime = {
      inherited: false,
      value: rememberedLifetime,
    };
    await updateOAuth2Client(clientId, client);
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
            // eslint-disable-next-line no-param-reassign
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
            // eslint-disable-next-line no-param-reassign
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
          // eslint-disable-next-line no-param-reassign
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
    printError(error, `Error repairing org model user`);
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
          // eslint-disable-next-line no-param-reassign
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
    printError(error, `Error repairing org model org`);
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

export async function repairOrgModel(
  excludeCustomized: boolean,
  extendPermissions: boolean,
  dryRun: boolean
): Promise<boolean> {
  try {
    let repairData = false;
    repairData = repairData || (await repairOrgModelUser(dryRun));
    repairData = repairData || (await repairOrgModelOrg(dryRun));
    if (excludeCustomized) {
      //
    }
    if (repairData) {
      await repairOrgModelData(dryRun);
    }
    if (extendPermissions) {
      await extendOrgModelPermissins(dryRun);
    }
    if (dryRun) {
      printMessage('Dry-run only. Changes are not saved.', 'warn');
    }
    printMessage('Done.');
    return true;
  } catch (error) {
    printError(error, `Error repairing the org model`);
  }
  return false;
}

// Rfc7523 functions

function getJwkFilePath(clientId: string): string {
  return getFilePath(getTypedFilename(clientId + '_private', 'jwk'), true);
}

function getJwksFilePath(clientId: string): string {
  return getFilePath(getTypedFilename(clientId + '_public', 'jwks'), true);
}

export async function generateRfc7523AuthZGrantArtefacts(
  clientId: string,
  iss: string,
  jwk?: JwkRsa,
  sub?: string,
  scope?: string[],
  options?: { save: boolean },
  json?: boolean
): Promise<boolean> {
  let artefacts: {
    jwk: JwkRsa;
    jwks: JwksInterface;
    client: OAuth2ClientSkeleton;
    issuer: OAuth2TrustedJwtIssuerSkeleton;
  };
  try {
    const barId = createProgressIndicator(
      'determinate',
      options.save ? 3 : 1,
      'Generating artefacts...'
    );
    artefacts = await _generateRfc7523AuthZGrantArtefacts(
      clientId,
      iss,
      jwk,
      sub,
      scope,
      options
    );
    updateProgressIndicator(barId, 'Successfully generated artefacts.');
    let jwkFile: string;
    let jwksFile: string;
    if (options.save) {
      const jwkBarId = createProgressIndicator(
        'determinate',
        1,
        'Saving JWK (private key)...'
      );
      jwkFile = getJwkFilePath(clientId);
      saveJsonToFile(artefacts.jwk, jwkFile, false);
      updateProgressIndicator(jwkBarId, `Saved JWK to ${jwkFile}.`);
      updateProgressIndicator(barId, 'Successfully saved JWK (private key).');
      stopProgressIndicator(jwkBarId);
      const jwksBarId = createProgressIndicator(
        'determinate',
        1,
        'Saving JWKS (public key)...'
      );
      jwksFile = getJwksFilePath(clientId);
      saveJsonToFile(artefacts.jwks, jwksFile, false);
      updateProgressIndicator(jwksBarId, `Saved JWKS to ${jwksFile}.`);
      stopProgressIndicator(jwksBarId);
      updateProgressIndicator(barId, 'Successfully saved JWKS (public key).');
    }
    stopProgressIndicator(
      barId,
      `Successfully generated ${
        options.save ? 'and saved artefacts' : 'artefacts'
      }.`
    );
    cleanupProgressIndicators();

    if (json) {
      printMessage(artefacts, 'data');
    } else {
      printMessage(
        options.save
          ? `\nCreated oauth2 client in the ${state.getRealm()} realm:`
          : `\nIn AM, create an OAuth2 client in the ${state.getRealm()} realm with the following information:`
      );
      const client = createKeyValueTable();
      client.push(['Client ID'['brightCyan'], clientId]);
      client.push(['Client Name'['brightCyan'], clientId]);
      client.push([
        'Scopes'['brightCyan'],
        (
          artefacts.client.coreOAuth2ClientConfig.scopes as Writable<string[]>
        ).value.join(', '),
      ]);
      client.push([
        'Client Type'['brightCyan'],
        (artefacts.client.coreOAuth2ClientConfig.clientType as Writable<string>)
          .value,
      ]);
      client.push([
        'Grant Types'['brightCyan'],
        (
          artefacts.client.advancedOAuth2ClientConfig.grantTypes as Writable<
            string[]
          >
        ).value.join(', '),
      ]);
      client.push([
        'Implied Consent'['brightCyan'],
        (
          artefacts.client.advancedOAuth2ClientConfig
            .isConsentImplied as Writable<boolean>
        ).value,
      ]);
      client.push([
        'Token Endpoint Authentication '['brightCyan'],
        (
          artefacts.client.advancedOAuth2ClientConfig
            .tokenEndpointAuthMethod as Writable<string>
        ).value,
      ]);
      client.push([
        'Public Key Selector'['brightCyan'],
        (
          artefacts.client.signEncOAuth2ClientConfig
            .publicKeyLocation as Writable<string>
        ).value,
      ]);
      client.push([
        'JWKS (Public Key)'['brightCyan'],
        options.save ? `${jwksFile}` : 'See below',
      ]);
      printMessage(`\n${client.toString()}`);

      printMessage(
        options.save
          ? `\nCreated oauth2 trusted issuer in the ${state.getRealm()} realm:`
          : `\nIn AM, create a trusted issuer in the ${state.getRealm()} realm with the following information:`
      );
      const issuer = createKeyValueTable();
      issuer.push(['Name'['brightCyan'], artefacts.issuer._id]);
      issuer.push([
        'JWT Issuer'['brightCyan'],
        (artefacts.issuer.issuer as Writable<string>).value,
      ]);
      issuer.push([
        'Allowed Subjects              '['brightCyan'],
        (artefacts.issuer.allowedSubjects as Writable<string[]>)?.value.length
          ? (
              artefacts.issuer.allowedSubjects as Writable<string[]>
            )?.value.join(', ')
          : `Any ${state.getRealm()} realm user`,
      ]);
      issuer.push([
        'JWKS (Public Key)'['brightCyan'],
        options.save ? `${jwksFile}` : 'See below',
      ]);
      printMessage(`\n${issuer.toString()}`);
      if (!options.save) {
        printMessage('\nJWK (Private Key)'['brightCyan']);
        printMessage(stringify(artefacts.jwk));
        printMessage('\nJWKS (Public Key)'['brightCyan']);
        printMessage(stringify(artefacts.jwks));
      }
    }
    return true;
  } catch (error) {
    printMessage(error, 'error');
    return false;
  }
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
    let issuer: OAuth2TrustedJwtIssuerSkeleton;
    // make sure we have an issuer
    if (!iss) {
      let issSpinnerId: string;
      try {
        issSpinnerId = createProgressIndicator(
          'indeterminate',
          0,
          'No issuer provided, attempting to find suitable issuer...'
        );
        if (!issuer)
          issuer = await readOAuth2TrustedJwtIssuer(clientId + '-issuer');
        iss = (issuer.issuer as Writable<string>).value;
        stopProgressIndicator(
          issSpinnerId,
          `Found suitable issuer: ${clientId + '-issuer'} - ${iss}`,
          'success'
        );
      } catch (error) {
        stopProgressIndicator(
          issSpinnerId,
          `No issuer provided and no suitable issuer could be found: ${error.message}`,
          'fail'
        );
      }
    }
    // make sure we have a JWK
    if (!jwk) {
      let jwkSpinnerId: string;
      try {
        jwkSpinnerId = createProgressIndicator(
          'indeterminate',
          0,
          'No JWK provided, attempting to locate a suitable JWK...'
        );
        jwk = JSON.parse(fs.readFileSync(getJwkFilePath(clientId), 'utf8'));
        stopProgressIndicator(
          jwkSpinnerId,
          `Loaded private key JWK from: ${getJwkFilePath(clientId)}`,
          'success'
        );
      } catch (error) {
        stopProgressIndicator(
          jwkSpinnerId,
          `No JWK provided and no suitable JWK could be loaded from file: ${error.message}`,
          'fail'
        );
      }
    }
    // make sure we have a subject
    if (!sub) {
      let subSpinnerId: string;
      try {
        subSpinnerId = createProgressIndicator(
          'indeterminate',
          0,
          'Executing rfc7523 authz grant flow...'
        );
        if (!issuer)
          issuer = await frodo.oauth2oidc.issuer.readOAuth2TrustedJwtIssuer(
            clientId + '-issuer'
          );
        if (
          (issuer.allowedSubjects as Writable<string[]>).value &&
          (issuer.allowedSubjects as Writable<string[]>).value.length
        )
          sub = (issuer.allowedSubjects as Writable<string[]>).value[0];
      } catch (error) {
        stopProgressIndicator(
          subSpinnerId,
          `No subject provided and no suitable subject could be extracted from the trusted issuer configuration: ${error.message}`,
          'fail'
        );
      }
      if (sub) {
        stopProgressIndicator(
          subSpinnerId,
          `Using first subject from issuer's allowed subjects: ${sub}`,
          'success'
        );
      } else {
        stopProgressIndicator(
          subSpinnerId,
          `No subject provided and no suitable subject could be extracted from the trusted issuer's list of allowed subjects.`,
          'success'
        );
      }
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
    stopProgressIndicator(
      spinnerId,
      `Error executing rfc7523 authz grant flow: ${stringify(
        error.response?.data || error.message
      )}`,
      'fail'
    );
    return false;
  }
  cleanupProgressIndicators();

  if (json) {
    printMessage(tokenResponse, 'data');
  } else {
    printMessage('\nAccess Token'['brightCyan']);
    printMessage(tokenResponse.access_token);
    if (tokenResponse.id_token) {
      printMessage('\nIdentity Token'['brightCyan']);
      printMessage(tokenResponse.id_token);
    }
  }
  return true;
}
