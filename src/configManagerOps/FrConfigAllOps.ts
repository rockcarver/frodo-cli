import { frodo, state } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';
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
import { configManagerExportOrgPrivileges } from './FrConfigOrgPrivilegesOps';
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
    (options) =>
      configManagerExportAuthzPolicySets(
        `${options.configFolder}/authz-policies.json`
      ),
    (options) =>
      configManagerExportOAuth2Agents(
        `${options.configFolder}/oauth2-agents.json`
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
    () => configManagerExportOrgPrivileges(),
    (options) => configManagerExportPasswordPolicy(options.realm),
    (options) => configManagerExportRaw(`${options.configFolder}/raw.json`),
    () => configManagerExportRemoteServers(),
    (options) => configManagerExportSaml(`${options.configFolder}/saml.json`),
    () => configManagerExportSchedules(),
    (options) => configManagerExportScripts(undefined, options.realm),
    (options) =>
      configManagerExportServiceObjectsFromFile(
        `${options.configFolder}/service-objects.json`
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
    (options) =>
      configManagerExportAuthzPolicySets(
        `${options.configFolder}/authz-policies.json`
      ),
    (options) =>
      configManagerExportOAuth2Agents(
        `${options.configFolder}/oauth2-agents.json`
      ),
    () => configManagerExportConnectorDefinitionsAll(),
    () => configManagerExportCookieDomains(),
    () => configManagerExportCors(),
    (options) =>
      configManagerExportCsp(`${options.configFolder}/csp-overrides.json`),
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
    () => configManagerExportOrgPrivileges(),
    (options) => configManagerExportPasswordPolicy(options.realm),
    (options) => configManagerExportRaw(`${options.configFolder}/raw.json`),
    () => configManagerExportRemoteServers(),
    (options) => configManagerExportSaml(`${options.configFolder}/saml.json`),
    () => configManagerExportSchedules(),
    (options) => configManagerExportScripts(undefined, options.realm),
    () => configManagerExportSecrets(),
    (options) => configManagerExportSecretMappings(undefined, options.realm),
    (options) =>
      configManagerExportServiceObjectsFromFile(
        `${options.configFolder}/service-objects.json`
      ),
    () => configManagerExportServices(),
    () => configManagerExportTermsAndConditions(),
    (options) => configManagerExportThemes(options.realm),
    () => configManagerExportUiConfig(),
    () => configManagerExportVariables(),
  ],
  [CLASSIC_DEPLOYMENT_TYPE_KEY]: [
    (options) => configManagerExportAuthentication(options.realm),
    (options) =>
      configManagerExportAuthzPolicySets(
        `${options.configFolder}/authz-policies.json`
      ),
    (options) =>
      configManagerExportOAuth2Agents(
        `${options.configFolder}/oauth2-agents.json`
      ),
    () => configManagerExportCors(),
    () => configManagerExportCustomNodes(),
    (options) => configManagerExportJourneys(undefined, options.realm),
    (options) => configManagerExportRaw(`${options.configFolder}/raw.json`),
    (options) => configManagerExportSaml(`${options.configFolder}/saml.json`),
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
    () => configManagerExportOrgPrivileges(),
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
    () => configManagerExportCors(),
    () => configManagerExportCustomNodes(),
    () => configManagerExportEmailProviderConfiguration(),
    () => configManagerExportEmailTemplates(),
    () => configManagerExportEndpoints(),
    (options) => configManagerExportJourneys(undefined, options.realm),
    () => configManagerExportKbaConfig(),
    () => configManagerExportLocales(),
    () => configManagerExportManagedObjects(),
    () => configManagerExportMappings(),
    () => configManagerExportOrgPrivileges(),
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
