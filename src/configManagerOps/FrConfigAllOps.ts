import { frodo, state } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';
import { configFileStep, existingConfigFile } from './ConfigFileStep';
import { configManagerExportAccessConfig } from './FrConfigAccessConfigOps';
import { configManagerExportAudit } from './FrConfigAuditOps';
import { configManagerExportAuthentication } from './FrConfigAuthenticationOps';
import { configManagerExportAuthzPolicySets } from './FrConfigAuthzPoliciesOps';
import { configManagerExportConnectorDefinitionsAll } from './FrConfigConnectorDefinitionsOps';
import { configManagerExportMappings } from './FrConfigConnectorMappingOps';
import { configManagerExportCookieDomains } from './FrConfigCookieDomainsOps';
import { configManagerExportCors } from './FrConfigCorsOps';
import { configManagerExportCsp } from './FrConfigCspOps';
import { configManagerExportCustomNodes } from './FrConfigCustomNodesOps';
import { configManagerExportEmailProviderConfiguration } from './FrConfigEmailProviderOps';
import { configManagerExportEmailTemplates } from './FrConfigEmailTemplatesOps';
import { configManagerExportEndpoints } from './FrConfigEndpointsOps';
import { configManagerExportIdmAuthentication } from './FrConfigIdmAuthenticationOpts';
import { configManagerExportInternalRoles } from './FrConfigInternalRolesOps';
import { configManagerExportJourneys } from './FrConfigJourneysOps';
import { configManagerExportKbaConfig } from './FrConfigKbaOps';
import { configManagerExportLocales } from './FrConfigLocalesOps';
import { configManagerExportManagedObjects } from './FrConfigManagedObjectsOps';
import { configManagerExportOAuth2Agents } from './FrConfigOauth2AgentOps';
import { configManagerExportOrgPrivilegesAllRealms } from './FrConfigOrgPrivilegesOps';
import { configManagerExportPasswordPolicy } from './FrConfigPasswordPolicyOps';
import { configManagerExportRaw } from './FrConfigRawOps';
import { configManagerExportRemoteServers } from './FrConfigRemoteServersOps';
import { configManagerExportSaml } from './FrConfigSamlOps';
import { configManagerExportSchedules } from './FrConfigSchedulesOps';
import { configManagerExportScripts } from './FrConfigScriptOps';
import { configManagerExportSecretMappings } from './FrConfigSecretMappingsOps';
import { configManagerExportSecrets } from './FrConfigSecretOps';
import { configManagerExportServiceObjectsFromFile } from './FrConfigServiceObjectsOps';
import { configManagerExportServices } from './FrConfigServiceOps';
import { configManagerExportTermsAndConditions } from './FrConfigTermsAndConditionsOps';
import { configManagerExportThemes } from './FrConfigThemeOps';
import { configManagerExportUiConfig } from './FrConfigUiConfigOps';
import { configManagerExportVariables } from './FrConfigVariableOps';

const {
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentMapAll = {
  [FORGEOPS_DEPLOYMENT_TYPE_KEY]: [
    () => configManagerExportAccessConfig(),
    () => configManagerExportAudit(),
    (options) => configManagerExportAuthentication(options.realm),
    configFileStep(
      'Authz Policy Sets',
      'authz-policies.json',
      configManagerExportAuthzPolicySets
    ),
    configFileStep(
      'OAuth2 agents',
      'oauth2-agents.json',
      configManagerExportOAuth2Agents
    ),
    () => configManagerExportConnectorDefinitionsAll(),
    () => configManagerExportCors(),
    () => configManagerExportCustomNodes(),
    () => configManagerExportEmailProviderConfiguration(),
    () => configManagerExportEmailTemplates(),
    () => configManagerExportEndpoints(),
    () => configManagerExportInternalRoles(),
    (options) => configManagerExportJourneys(undefined, options.realm),
    () => configManagerExportKbaConfig(),
    () => configManagerExportLocales(),
    () => configManagerExportManagedObjects(),
    () => configManagerExportMappings(),
    (options) => configManagerExportOrgPrivilegesAllRealms(options.realm),
    (options) => configManagerExportPasswordPolicy(options.realm),
    configFileStep('raw config', 'raw.json', configManagerExportRaw, {
      optional: true,
    }),
    () => configManagerExportRemoteServers(),
    configFileStep('SAML', 'saml.json', configManagerExportSaml),
    () => configManagerExportSchedules(),
    (options) => configManagerExportScripts(undefined, options.realm),
    configFileStep(
      'service objects',
      'service-objects.json',
      configManagerExportServiceObjectsFromFile
    ),
    (options) => configManagerExportServices(options.realm),
    () => configManagerExportTermsAndConditions(),
    (options) => configManagerExportThemes(options.realm),
    () => configManagerExportUiConfig(),
  ],
  [CLOUD_DEPLOYMENT_TYPE_KEY]: [
    () => configManagerExportAccessConfig(),
    () => configManagerExportAudit(),
    (options) => configManagerExportAuthentication(options.realm),
    configFileStep(
      'Authz Policy Sets',
      'authz-policies.json',
      configManagerExportAuthzPolicySets
    ),
    configFileStep(
      'OAuth2 agents',
      'oauth2-agents.json',
      configManagerExportOAuth2Agents
    ),
    () => configManagerExportConnectorDefinitionsAll(),
    () => configManagerExportCookieDomains(),
    () => configManagerExportCors(),
    (options) =>
      configManagerExportCsp(
        existingConfigFile(options.configFolder, 'csp-overrides.json')
      ),
    () => configManagerExportCustomNodes(),
    () => configManagerExportEmailProviderConfiguration(),
    () => configManagerExportEmailTemplates(),
    () => configManagerExportEndpoints(),
    () => configManagerExportInternalRoles(),
    (options) => configManagerExportJourneys(undefined, options.realm),
    () => configManagerExportKbaConfig(),
    () => configManagerExportLocales(),
    () => configManagerExportManagedObjects(undefined, true),
    () => configManagerExportMappings(),
    (options) => configManagerExportOrgPrivilegesAllRealms(options.realm),
    (options) => configManagerExportPasswordPolicy(options.realm),
    configFileStep('raw config', 'raw.json', configManagerExportRaw, {
      optional: true,
    }),
    () => configManagerExportRemoteServers(),
    configFileStep('SAML', 'saml.json', configManagerExportSaml),
    () => configManagerExportSchedules(),
    (options) => configManagerExportScripts(undefined, options.realm),
    () => configManagerExportSecrets(),
    (options) => configManagerExportSecretMappings(undefined, options.realm),
    configFileStep(
      'service objects',
      'service-objects.json',
      configManagerExportServiceObjectsFromFile
    ),
    (options) => configManagerExportServices(options.realm),
    () => configManagerExportTermsAndConditions(),
    (options) => configManagerExportThemes(options.realm),
    () => configManagerExportUiConfig(),
    () => configManagerExportVariables(),
  ],
  [CLASSIC_DEPLOYMENT_TYPE_KEY]: [
    (options) => configManagerExportAuthentication(options.realm),
    configFileStep(
      'Authz Policy Sets',
      'authz-policies.json',
      configManagerExportAuthzPolicySets
    ),
    configFileStep(
      'OAuth2 agents',
      'oauth2-agents.json',
      configManagerExportOAuth2Agents
    ),
    () => configManagerExportCors(),
    () => configManagerExportCustomNodes(),
    (options) => configManagerExportJourneys(undefined, options.realm),
    configFileStep('raw config', 'raw.json', configManagerExportRaw, {
      optional: true,
    }),
    configFileStep('SAML', 'saml.json', configManagerExportSaml),
    (options) => configManagerExportScripts(undefined, options.realm),
    (options) => configManagerExportServices(options.realm),
  ],
};

const deploymentMapAllStatic = {
  [FORGEOPS_DEPLOYMENT_TYPE_KEY]: [
    () => configManagerExportAccessConfig(),
    () => configManagerExportAudit(),
    (options) => configManagerExportAuthentication(options.realm),
    () => configManagerExportConnectorDefinitionsAll(),
    () => configManagerExportCors(),
    () => configManagerExportCustomNodes(),
    () => configManagerExportEmailProviderConfiguration(),
    () => configManagerExportEmailTemplates(),
    () => configManagerExportEndpoints(),
    () => configManagerExportIdmAuthentication(),
    (options) => configManagerExportJourneys(undefined, options.realm),
    () => configManagerExportKbaConfig(),
    () => configManagerExportLocales(),
    () => configManagerExportManagedObjects(),
    () => configManagerExportMappings(),
    (options) => configManagerExportOrgPrivilegesAllRealms(options.realm),
    (options) => configManagerExportPasswordPolicy(options.realm),
    () => configManagerExportRemoteServers(),
    () => configManagerExportSchedules(),
    (options) => configManagerExportScripts(undefined, options.realm),
    (options) => configManagerExportServices(options.realm),
    () => configManagerExportTermsAndConditions(),
    (options) => configManagerExportThemes(options.realm),
    () => configManagerExportUiConfig(),
  ],
  [CLOUD_DEPLOYMENT_TYPE_KEY]: [
    () => configManagerExportAccessConfig(),
    () => configManagerExportAudit(),
    (options) => configManagerExportAuthentication(options.realm),
    () => configManagerExportConnectorDefinitionsAll(),
    () => configManagerExportCookieDomains(),
    () => configManagerExportCors(),
    () => configManagerExportCsp(),
    () => configManagerExportCustomNodes(),
    () => configManagerExportEmailProviderConfiguration(),
    () => configManagerExportEmailTemplates(),
    () => configManagerExportEndpoints(),
    (options) => configManagerExportJourneys(undefined, options.realm),
    () => configManagerExportKbaConfig(),
    () => configManagerExportLocales(),
    () => configManagerExportManagedObjects(undefined, true),
    () => configManagerExportMappings(),
    (options) => configManagerExportOrgPrivilegesAllRealms(options.realm),
    (options) => configManagerExportPasswordPolicy(options.realm),
    () => configManagerExportRemoteServers(),
    () => configManagerExportSchedules(),
    (options) => configManagerExportScripts(undefined, options.realm),
    (options) => configManagerExportSecretMappings(undefined, options.realm),
    (options) => configManagerExportServices(options.realm),
    () => configManagerExportTermsAndConditions(),
    (options) => configManagerExportThemes(options.realm),
    () => configManagerExportUiConfig(),
  ],
  [CLASSIC_DEPLOYMENT_TYPE_KEY]: [
    (options) => configManagerExportAuthentication(options.realm),
    () => configManagerExportCors(),
    () => configManagerExportCustomNodes(),
    (options) => configManagerExportJourneys(undefined, options.realm),
    (options) => configManagerExportScripts(undefined, options.realm),
    (options) => configManagerExportServices(options.realm),
  ],
};

export interface ConfigManagerAllOptions {
  configFolder?: string;
  realm?: string;
}

export async function configManagerExportAllWithConfigFolder(
  options: ConfigManagerAllOptions = {}
): Promise<boolean> {
  try {
    const functions = deploymentMapAll[state.getDeploymentType()];
    for (const f of functions) {
      await f(options);
    }
    return true;
  } catch (error) {
    printError(error, 'Error exporting all in fr-config-manager format');
    return false;
  }
}

export async function configManagerExportAllStatic(
  options: ConfigManagerAllOptions = {}
): Promise<boolean> {
  try {
    const functions = deploymentMapAllStatic[state.getDeploymentType()];
    for (const f of functions) {
      await f(options);
    }
    return true;
  } catch (error) {
    printError(error, 'Error exporting all-static in fr-config-manager format');
    return false;
  }
}
