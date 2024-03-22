import { frodo, state } from '@rockcarver/frodo-lib';
import { AgentSkeleton } from '@rockcarver/frodo-lib/types/api/AgentApi';
import { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { AuthenticationSettingsSkeleton } from '@rockcarver/frodo-lib/types/api/AuthenticationSettingsApi';
import { CircleOfTrustSkeleton } from '@rockcarver/frodo-lib/types/api/CirclesOfTrustApi';
import { SecretSkeleton } from '@rockcarver/frodo-lib/types/api/cloud/SecretsApi';
import { VariableSkeleton } from '@rockcarver/frodo-lib/types/api/cloud/VariablesApi';
import { OAuth2ClientSkeleton } from '@rockcarver/frodo-lib/types/api/OAuth2ClientApi';
import { PolicySkeleton } from '@rockcarver/frodo-lib/types/api/PoliciesApi';
import { PolicySetSkeleton } from '@rockcarver/frodo-lib/types/api/PolicySetApi';
import { ResourceTypeSkeleton } from '@rockcarver/frodo-lib/types/api/ResourceTypesApi';
import { Saml2ProviderSkeleton } from '@rockcarver/frodo-lib/types/api/Saml2Api';
import { ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ScriptApi';
import { AmServiceSkeleton } from '@rockcarver/frodo-lib/types/api/ServiceApi';
import { SocialIdpSkeleton } from '@rockcarver/frodo-lib/types/api/SocialIdentityProvidersApi';
import { ApplicationSkeleton } from '@rockcarver/frodo-lib/types/ops/ApplicationOps';
import { CirclesOfTrustExportInterface } from '@rockcarver/frodo-lib/types/ops/CirclesOfTrustOps';
import {
  EmailTemplateExportInterface,
  EmailTemplateSkeleton,
} from '@rockcarver/frodo-lib/types/ops/EmailTemplateOps';
import { SocialProviderExportInterface } from '@rockcarver/frodo-lib/types/ops/IdpOps';
import {
  MultiTreeExportInterface,
  SingleTreeExportInterface,
} from '@rockcarver/frodo-lib/types/ops/JourneyOps';
import { ExportMetaData } from '@rockcarver/frodo-lib/types/ops/OpsTypes';
import { PolicyExportInterface } from '@rockcarver/frodo-lib/types/ops/PolicyOps';
import { PolicySetExportInterface } from '@rockcarver/frodo-lib/types/ops/PolicySetOps';
import { ResourceTypeExportInterface } from '@rockcarver/frodo-lib/types/ops/ResourceTypeOps';
import { ScriptExportInterface } from '@rockcarver/frodo-lib/types/ops/ScriptOps';
import { ServiceExportInterface } from '@rockcarver/frodo-lib/types/ops/ServiceOps';
import {
  ThemeExportInterface,
  ThemeSkeleton,
} from '@rockcarver/frodo-lib/types/ops/ThemeOps';
import fs from 'fs';
import fse from 'fs-extra';

import {
  getFullExportConfig,
  getFullExportConfigFromDirectory,
} from '../utils/Config';
import {
  createProgressIndicator,
  debugMessage,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { extractScriptToFile } from './ScriptOps';
import { exportOrImportWithErrorHandling } from './utils/OpsUtils';

const { exportAgents, importAgents } = frodo.agent;
const { exportApplications, importApplications } = frodo.app;
const { exportAuthenticationSettings, importAuthenticationSettings } =
  frodo.authn.settings;
const { exportCirclesOfTrust, importCirclesOfTrust } =
  frodo.saml2.circlesOfTrust;
const { exportSecrets } = frodo.cloud.secret;
const { exportVariables } = frodo.cloud.variable;
const { exportEmailTemplates, importEmailTemplates } = frodo.email.template;
const { exportConfigEntities, importConfigEntities } = frodo.idm.config;
const { exportSocialIdentityProviders, importSocialIdentityProviders } =
  frodo.oauth2oidc.external;
const { exportJourneys, importJourneys } = frodo.authn.journey;
const { exportPolicySets, importPolicySets } = frodo.authz.policySet;
const { exportResourceTypes, importResourceTypes } = frodo.authz.resourceType;
const { exportSaml2Providers, importSaml2Providers } =
  frodo.saml2.entityProvider;
const { exportOAuth2Clients, importOAuth2Clients } = frodo.oauth2oidc.client;
const { exportPolicies, importPolicies } = frodo.authz.policy;
const { exportScripts, importScripts } = frodo.script;
const { exportServices, importServices } = frodo.service;
const { exportThemes, importThemes } = frodo.theme;
const {
  getRealmName,
  getTypedFilename,
  titleCase,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
  getMetadata,
} = frodo.utils;
const { stringify } = frodo.utils.json;

/**
 * Full export options
 */
export interface FullExportOptions {
  /**
   * Use string arrays to store multi-line text in scripts.
   */
  useStringArrays: boolean;
  /**
   * Do not include decoded variable value in export
   */
  noDecode: boolean;
  /**
   * Include x and y coordinate positions of the journey/tree nodes.
   */
  coords: boolean;
  /**
   * Include default scripts in export if true
   */
  includeDefault: boolean;
}

/**
 * Full import options
 */
export interface FullImportOptions {
  /**
   * Generate new UUIDs for all journey nodes during import.
   */
  reUuidJourneys: boolean;
  /**
   * Generate new UUIDs for all scripts during import.
   */
  reUuidScripts: boolean;
  /**
   * Indicates whether to remove previously existing services of the same id before importing
   */
  cleanServices: boolean;
  /**
   * Indicates whether to import service(s) as global services
   */
  global: boolean;
  /**
   * Indicates whether to import service(s) to the current realm
   */
  realm: boolean;
  /**
   * Include default scripts in import if true
   */
  includeDefault: boolean;
}

export interface FullExportInterface {
  meta?: ExportMetaData;
  agents: Record<string, AgentSkeleton> | undefined;
  application: Record<string, OAuth2ClientSkeleton> | undefined;
  authentication: AuthenticationSettingsSkeleton | undefined;
  config: Record<string, IdObjectSkeletonInterface> | undefined;
  emailTemplate: Record<string, EmailTemplateSkeleton> | undefined;
  idp: Record<string, SocialIdpSkeleton> | undefined;
  managedApplication: Record<string, ApplicationSkeleton> | undefined;
  policy: Record<string, PolicySkeleton> | undefined;
  policyset: Record<string, PolicySetSkeleton> | undefined;
  resourcetype: Record<string, ResourceTypeSkeleton> | undefined;
  saml:
    | {
        hosted: Record<string, Saml2ProviderSkeleton>;
        remote: Record<string, Saml2ProviderSkeleton>;
        metadata: Record<string, string[]>;
        cot: Record<string, CircleOfTrustSkeleton> | undefined;
      }
    | undefined;
  script: Record<string, ScriptSkeleton> | undefined;
  secrets: Record<string, SecretSkeleton> | undefined;
  service: Record<string, AmServiceSkeleton> | undefined;
  theme: Record<string, ThemeSkeleton> | undefined;
  trees: Record<string, SingleTreeExportInterface> | undefined;
  variables: Record<string, VariableSkeleton> | undefined;
}

/**
 * Export full configuration
 * @param {FullExportOptions} options export options
 */
export async function exportFullConfiguration(
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: false,
  }
): Promise<FullExportInterface> {
  debugMessage(`cli.ConfigOps.exportFullConfiguration: start`);
  const { useStringArrays, noDecode, coords, includeDefault } = options;
  //Export saml2 providers and circle of trusts
  debugMessage(`cli.ConfigOps.exportFullConfiguration: export saml providers`);
  let saml = (
    (await exportOrImportWithErrorHandling(
      exportSaml2Providers
    )) as CirclesOfTrustExportInterface
  )?.saml;
  debugMessage(`cli.ConfigOps.exportFullConfiguration: export saml cots`);
  const cotExport = await exportOrImportWithErrorHandling(exportCirclesOfTrust);
  if (saml) {
    saml.cot = cotExport?.saml.cot;
  } else {
    saml = cotExport?.saml;
  }
  // agents
  debugMessage(`cli.ConfigOps.exportFullConfiguration: export agents`);
  const agents = (await exportOrImportWithErrorHandling(exportAgents))?.agents;
  // oauth2 clients
  debugMessage(`cli.ConfigOps.exportFullConfiguration: export oauth2 clients`);
  const application = (
    await exportOrImportWithErrorHandling(exportOAuth2Clients, [
      {
        deps: false,
        useStringArrays,
      },
    ])
  )?.application;
  //Create full export
  const fullExport = {
    meta: getMetadata(),
    agents,
    application,
    authentication: (
      await exportOrImportWithErrorHandling(exportAuthenticationSettings)
    )?.authentication,
    config: (await exportOrImportWithErrorHandling(exportConfigEntities))
      ?.config,
    emailTemplate: (
      (await exportOrImportWithErrorHandling(
        exportEmailTemplates
      )) as EmailTemplateExportInterface
    )?.emailTemplate,
    idp: (
      (await exportOrImportWithErrorHandling(
        exportSocialIdentityProviders
      )) as SocialProviderExportInterface
    )?.idp,
    managedApplication: (
      await exportOrImportWithErrorHandling(exportApplications, [
        {
          deps: false,
          useStringArrays,
        },
      ])
    )?.managedApplication,
    policy: (
      (await exportOrImportWithErrorHandling(exportPolicies, [
        {
          deps: false,
          prereqs: false,
          useStringArrays,
        },
      ])) as PolicyExportInterface
    )?.policy,
    policyset: (
      (await exportOrImportWithErrorHandling(exportPolicySets, [
        { deps: false, prereqs: false, useStringArrays },
      ])) as PolicySetExportInterface
    )?.policyset,
    resourcetype: (
      (await exportOrImportWithErrorHandling(
        exportResourceTypes
      )) as ResourceTypeExportInterface
    )?.resourcetype,
    saml,
    script: (
      await exportOrImportWithErrorHandling(exportScripts, [includeDefault])
    )?.script,
    secrets: (await exportOrImportWithErrorHandling(exportSecrets))?.secrets,
    service: {
      ...(
        (await exportOrImportWithErrorHandling(exportServices, [
          true,
        ])) as ServiceExportInterface
      )?.service,
      ...(
        (await exportOrImportWithErrorHandling(exportServices, [
          false,
        ])) as ServiceExportInterface
      )?.service,
    },
    theme: (
      (await exportOrImportWithErrorHandling(
        exportThemes
      )) as ThemeExportInterface
    )?.theme,
    trees: (
      (await exportOrImportWithErrorHandling(exportJourneys, [
        {
          deps: false,
          useStringArrays,
          coords,
        },
      ])) as MultiTreeExportInterface
    )?.trees,
    variables: (
      await exportOrImportWithErrorHandling(exportVariables, [noDecode])
    )?.variables,
  };
  debugMessage(`cli.ConfigOps.exportFullConfiguration: end`);
  return fullExport;
}

/**
 * Import full configuration
 * @param {FullExportInterface} importData import data
 * @param {FullImportOptions} options import options
 */
export async function importFullConfiguration(
  importData: FullExportInterface,
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    global: false,
    realm: false,
    includeDefault: false,
  }
): Promise<void> {
  const {
    reUuidJourneys,
    reUuidScripts,
    cleanServices,
    global,
    realm,
    includeDefault,
  } = options;
  const indicatorId = createProgressIndicator(
    'determinate',
    16,
    'Importing everything...'
  );
  // Order of imports matter here since we want dependencies to be imported first. For example, journeys depend on a lot of things, so they are last, and many things depend on scripts, so they are first.
  updateProgressIndicator(indicatorId, `Importing Scripts...`);
  await exportOrImportWithErrorHandling(importScripts, [
    '',
    importData,
    {
      reUuid: reUuidScripts,
      includeDefault,
    },
    false,
  ]);
  updateProgressIndicator(indicatorId, `Importing Authentication Settings...`);
  await exportOrImportWithErrorHandling(importAuthenticationSettings, [
    importData,
  ]);
  updateProgressIndicator(indicatorId, `Importing Agents...`);
  await exportOrImportWithErrorHandling(importAgents, [importData]);
  updateProgressIndicator(indicatorId, `Importing IDM Config Entities...`);
  await exportOrImportWithErrorHandling(importConfigEntities, [
    importData,
    { validate: false },
  ]);
  updateProgressIndicator(indicatorId, `Importing Email Templates...`);
  await exportOrImportWithErrorHandling(importEmailTemplates, [importData]);
  updateProgressIndicator(indicatorId, `Importing Resource Types...`);
  await exportOrImportWithErrorHandling(importResourceTypes, [importData]);
  updateProgressIndicator(indicatorId, `Importing Circles of Trust...`);
  await exportOrImportWithErrorHandling(importCirclesOfTrust, [importData]);
  updateProgressIndicator(indicatorId, `Importing Services...`);
  await exportOrImportWithErrorHandling(importServices, [
    importData,
    { clean: cleanServices, global, realm },
  ]);
  updateProgressIndicator(indicatorId, `Importing Themes...`);
  await exportOrImportWithErrorHandling(importThemes, [importData]);
  updateProgressIndicator(indicatorId, `Importing Saml2 Providers...`);
  await exportOrImportWithErrorHandling(importSaml2Providers, [
    importData,
    { deps: false },
  ]);
  updateProgressIndicator(
    indicatorId,
    `Importing Social Identity Providers...`
  );
  await exportOrImportWithErrorHandling(importSocialIdentityProviders, [
    importData,
    { deps: false },
  ]);
  updateProgressIndicator(indicatorId, `Importing OAuth2 Clients...`);
  await exportOrImportWithErrorHandling(importOAuth2Clients, [
    importData,
    { deps: false },
  ]);
  updateProgressIndicator(indicatorId, `Importing Applications...`);
  await exportOrImportWithErrorHandling(importApplications, [
    importData,
    { deps: false },
  ]);
  updateProgressIndicator(indicatorId, `Importing Policy Sets...`);
  await exportOrImportWithErrorHandling(importPolicySets, [
    importData,
    { deps: false, prereqs: false },
  ]);
  updateProgressIndicator(indicatorId, `Importing Policies...`);
  await exportOrImportWithErrorHandling(importPolicies, [
    importData,
    { deps: false, prereqs: false },
  ]);
  updateProgressIndicator(indicatorId, `Importing Journeys...`);
  await exportOrImportWithErrorHandling(importJourneys, [
    importData,
    { deps: false, reUuid: reUuidJourneys },
  ]);
  stopProgressIndicator(
    indicatorId,
    'Finished Importing Everything!',
    'success'
  );
}

/**
 * Export everything to separate files
 * @param {String} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {FullExportOptions} options export options
 */
export async function exportEverythingToFile(
  file: string,
  includeMeta: boolean = true,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: false,
  }
): Promise<void> {
  const exportData = await exportFullConfiguration(options);
  let fileName = getTypedFilename(
    `${titleCase(getRealmName(state.getRealm()))}`,
    `everything`
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
}

/**
 * Export everything to separate files
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {FullExportOptions} options export options
 */
export async function exportEverythingToFiles(
  extract: boolean = false,
  includeMeta: boolean = true,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: false,
  }
): Promise<void> {
  const exportData: FullExportInterface =
    await exportFullConfiguration(options);
  delete exportData.meta;
  const baseDirectory = getWorkingDirectory(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.entries(exportData).forEach(([type, obj]: [string, any]) => {
    if (obj) {
      if (!fs.existsSync(`${baseDirectory}/${type}`)) {
        fs.mkdirSync(`${baseDirectory}/${type}`);
      }
      if (type == 'saml') {
        const samlData = {
          saml: {
            cot: {},
            hosted: {},
            metadata: {},
            remote: {},
          },
        };
        if (obj.cot) {
          if (!fs.existsSync(`${baseDirectory}/cot`)) {
            fs.mkdirSync(`${baseDirectory}/cot`);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Object.entries(obj.cot).forEach(([id, value]: [string, any]) => {
            samlData.saml.cot = {
              [id]: value,
            };
            saveJsonToFile(
              samlData,
              `${baseDirectory}/cot/${getTypedFilename(id, 'cot.saml')}`,
              includeMeta
            );
          });
          samlData.saml.cot = {};
        }
        Object.entries(obj.hosted)
          .concat(Object.entries(obj.remote))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .forEach(([id, value]: [string, any]) => {
            const filename = getTypedFilename(
              value.entityId ? value.entityId : id,
              type
            );
            const samlType = obj.hosted[id] ? 'hosted' : 'remote';
            samlData.saml[samlType][id] = value;
            samlData.saml.metadata = {
              [id]: obj.metadata[id],
            };
            saveJsonToFile(
              samlData,
              `${baseDirectory}/${type}/${filename}`,
              includeMeta
            );
            samlData.saml[samlType] = {};
          });
      } else if (type == 'authentication') {
        const fileName = getTypedFilename(
          `${frodo.utils.getRealmName(state.getRealm())}Realm`,
          'authentication.settings'
        );
        saveJsonToFile(
          {
            authentication: obj,
          },
          `${baseDirectory}/${type}/${fileName}`,
          includeMeta
        );
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries(obj).forEach(([id, value]: [string, any]) => {
          if (type == 'config') {
            if (value != null) {
              const filename = `${id}.json`;
              if (filename.includes('/')) {
                fs.mkdirSync(
                  `${baseDirectory}/${type}/${filename.slice(
                    0,
                    filename.lastIndexOf('/')
                  )}`,
                  {
                    recursive: true,
                  }
                );
              }
              fse.outputFile(
                `${baseDirectory}/${type}/${filename}`,
                stringify(value),
                (err) => {
                  if (err) {
                    return printMessage(
                      `ERROR - can't save config ${id} to file - ${err}`,
                      'error'
                    );
                  }
                }
              );
            }
          } else {
            const filename = getTypedFilename(
              value && value.name ? value.name : id,
              type
            );
            if (extract && type == 'script') {
              extractScriptToFile(
                exportData as ScriptExportInterface,
                id,
                type
              );
            }
            saveJsonToFile(
              {
                [type]: {
                  [id]: value,
                },
              },
              `${baseDirectory}/${type}/${filename}`,
              includeMeta
            );
          }
        });
      }
    }
  });
}

/**
 * Import everything from a single file
 * @param {String} file The file path
 * @param {FullImportOptions} options import options
 */
export async function importEverythingFromFile(
  file: string,
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    global: false,
    realm: false,
    includeDefault: false,
  }
) {
  const data = await getFullExportConfig(file);
  await importFullConfiguration(data, options);
}

/**
 * Import everything from separate files
 */
export async function importEverythingFromFiles(
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    global: false,
    realm: false,
    includeDefault: false,
  }
) {
  const data = await getFullExportConfigFromDirectory(state.getDirectory());
  await importFullConfiguration(data, options);
}
