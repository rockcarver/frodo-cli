import { printError } from '../utils/Console';
import { configManagerExportAccessConfig } from './FrConfigAccessConfigOps';
import { configManagerExportAudit } from './FrConfigAuditOps';
import { configManagerExportAuthentication } from './FrConfigAuthenticationOps';
import { configManagerExportAuthzPolicySets } from './FrConfigAuthzPoliciesOps';
import { configManagerExportConnectorDefinitionsAll } from './FrConfigConnectorDefinitionsOps';
import { configManagerExportMappings } from './FrConfigConnectorMappingOps';
import { configManagerExportCookieDomains } from './FrConfigCookieDomainsOps';
import { configManagerExportCors } from './FrConfigCorsOps';
import { configManagerExportEmailProviderConfiguration } from './FrConfigEmailProviderOps';
import { configManagerExportEmailTemplates } from './FrConfigEmailTemplatesOps';
import { configManagerExportEndpoints } from './FrConfigEndpointsOps';
import { configManagerExportInternalRoles } from './FrConfigInternalRolesOps';
import { configManagerExportJourneys } from './FrConfigJourneysOps';
import { configManagerExportKbaConfig } from './FrConfigKbaOps';
import { configManagerExportLocales } from './FrConfigLocalesOps';
import { configManagerExportManagedObjects } from './FrConfigManagedObjectsOps';
import { configManagerExportConfigAgents } from './FrConfigOauth2AgentOps';
import { configManagerExportOrgPrivilegesAllRealms } from './FrConfigOrgPrivilegesOps';
import { configManagerExportPasswordPolicy } from './FrConfigPasswordPolicyOps';
import { configManagerExportRemoteServers } from './FrConfigRemoteServersOps';
import { configManagerExportSaml } from './FrConfigSamlOps';
import { configManagerExportSchedules } from './FrConfigSchedulesOps';
import { configManagerExportScriptsAll } from './FrConfigScriptOps';
import { configManagerExportSecretMappings } from './FrConfigSecretMappingsOps';
import { configManagerExportSecrets } from './FrConfigSecretOps';
import { configManagerExportServiceObjectsFromFile } from './FrConfigServiceObjectsOps';
import { configManagerExportServices } from './FrConfigServiceOps';
import { configManagerExportTermsAndConditions } from './FrConfigTermsAndConditionsOps';
import { configManagerExportThemes } from './FrConfigThemeOps';
import { configManagerExportUiConfig } from './FrConfigUiConfigOps';
import { configManagerExportVariables } from './FrConfigVariableOps';

export interface ConfigManagerAllOptions {
  all?: boolean;
  realm?: string;
  configFolder?: string;
}

export async function configManagerExportAllWithConfigFolder(
  options: ConfigManagerAllOptions = {}
): Promise<boolean> {
  try {
    await configManagerExportAccessConfig();
    await configManagerExportAudit();
    await configManagerExportAuthentication();

    try {
      await configManagerExportAuthzPolicySets(
        `${options.configFolder}/authz-policies.json`
      );
    } catch (err) {
      printError(
        err,
        'Error exporting Authz Policy Sets, Please make sure the config file name is authz-policies.json in the config folder.'
      );
    }

    await configManagerExportConnectorDefinitionsAll();
    await configManagerExportMappings();
    await configManagerExportCookieDomains();
    await configManagerExportCors();
    await configManagerExportEmailProviderConfiguration();
    await configManagerExportEmailTemplates();
    await configManagerExportEndpoints();
    await configManagerExportInternalRoles();
    await configManagerExportJourneys();
    await configManagerExportKbaConfig();
    await configManagerExportLocales();
    await configManagerExportManagedObjects();

    try {
      await configManagerExportConfigAgents(
        `${options.configFolder}/oauth2-agents.json`
      );
    } catch (err) {
      printError(
        err,
        'Error exporting Oauth2 agents, Please make sure the config file name is oauth2-agents.json in the config folder.'
      );
    }

    await configManagerExportOrgPrivilegesAllRealms();
    await configManagerExportPasswordPolicy();
    await configManagerExportRemoteServers();
    await configManagerExportSchedules();

    try {
      await configManagerExportSaml(`${options.configFolder}/saml.json`);
    } catch (err) {
      printError(
        err,
        'Error exporting SAML, Please make sure the config file name is saml.json in the config folder.'
      );
    }

    await configManagerExportScriptsAll();
    await configManagerExportSecrets();
    await configManagerExportSecretMappings();

    try {
      await configManagerExportServiceObjectsFromFile(
        `${options.configFolder}/service-objects.json`
      );
    } catch (err) {
      printError(
        err,
        'Error exporting service objects, Please make sure the config file name is service-objects.json in the config folder.'
      );
    }
    options.configFolder;

    await configManagerExportServices();
    await configManagerExportThemes();
    await configManagerExportTermsAndConditions();
    await configManagerExportUiConfig();
    await configManagerExportVariables();
    return true;
  } catch (error) {
    printError(error, 'Error exporting all config files.');
    return false;
  }
}

export async function configManagerExportAllStatic(): Promise<boolean> {
  try {
    await configManagerExportAccessConfig();
    await configManagerExportAudit();
    await configManagerExportAuthentication();
    await configManagerExportConnectorDefinitionsAll();
    await configManagerExportMappings();

    await configManagerExportCors();
    await configManagerExportEmailProviderConfiguration();
    await configManagerExportEmailTemplates();
    await configManagerExportEndpoints();
    await configManagerExportJourneys();

    await configManagerExportKbaConfig();
    await configManagerExportLocales();
    await configManagerExportManagedObjects();
    await configManagerExportOrgPrivilegesAllRealms();
    await configManagerExportPasswordPolicy();

    await configManagerExportRemoteServers();
    await configManagerExportSchedules();
    await configManagerExportScriptsAll();
    await configManagerExportServices();
    await configManagerExportThemes();

    await configManagerExportTermsAndConditions();
    await configManagerExportUiConfig();

    return true;
  } catch (error) {
    printError(error, 'Error exporting all-static in fr-config-manager format');
    return false;
  }
}
