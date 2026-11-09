import { frodo, state } from '@rockcarver/frodo-lib';
import { configManagerExportApplications } from '../ops/ApplicationConfigOps';
import { configManagerExportRemoteProxies } from '../ops/RemoteProxyOps';
import { printError } from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';
import {
  decideApplicationLayout,
  type ApplicationLayoutDecision,
} from '../utils/TreeLayout';
import { configFileStep, existingConfigFile } from './ConfigFileStep';
import { configManagerExportAccessConfig } from './FrConfigAccessConfigOps';
import { configManagerExportAudit } from './FrConfigAuditOps';
import { configManagerExportAuthentication } from './FrConfigAuthenticationOps';
import { configManagerExportAuthzPolicySets } from './FrConfigAuthzPoliciesOps';
import { configManagerExportConnectorDefinitions } from './FrConfigConnectorDefinitionsOps';
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

const { getWorkingDirectory } = frodo.utils;

/** One step of `config-manager pull all` or `pull all-static`. */
export interface ExportStep {
  /** The name of the `config-manager pull` command that does the same, as shown in the summary of failed steps. */
  name: string;
  /** Answers false when the step failed (it has printed its own error). */
  run: (options: ConfigManagerAllOptions) => Promise<boolean | void>;
}

const step = (name: string, run: ExportStep['run']): ExportStep => ({
  name,
  run,
});

/**
 * A step that reads a file from the config folder, like {@link configFileStep}, and hands the layout
 * decision of `pull all` to the exporter (decision record 0042): the standalone kinds that the
 * decision concerns leave out what an application owns.
 */
const layoutFileStep =
  (
    label: string,
    fileName: string,
    exporter: (
      filePath: string,
      layout?: ApplicationLayoutDecision
    ) => Promise<boolean>
  ): ExportStep['run'] =>
  (options) =>
    configFileStep(label, fileName, (filePath) =>
      exporter(filePath, options.applicationLayout)
    )(options);

export const deploymentMapAll: Record<string, ExportStep[]> = {
  [FORGEOPS_DEPLOYMENT_TYPE_KEY]: [
    step('access-config', () => configManagerExportAccessConfig()),
    step('audit', () => configManagerExportAudit()),
    step('authentication', (options) =>
      configManagerExportAuthentication(options.realm)
    ),
    step(
      'authz-policies',
      configFileStep(
        'Authz Policy Sets',
        'authz-policies.json',
        configManagerExportAuthzPolicySets
      )
    ),
    step('cors', () => configManagerExportCors()),
    step('custom-nodes', () => configManagerExportCustomNodes()),
    step('email-provider', () =>
      configManagerExportEmailProviderConfiguration()
    ),
    step('email-templates', () => configManagerExportEmailTemplates()),
    step('endpoints', () => configManagerExportEndpoints()),
    step('internal-roles', () => configManagerExportInternalRoles()),
    step('journeys', (options) =>
      configManagerExportJourneys(undefined, options.realm)
    ),
    step('kba', () => configManagerExportKbaConfig()),
    step('locales', () => configManagerExportLocales()),
    step('managed-objects', () => configManagerExportManagedObjects()),
    step('org-privileges', (options) =>
      configManagerExportOrgPrivilegesAllRealms(options.realm)
    ),
    step('password-policy', (options) =>
      configManagerExportPasswordPolicy(options.realm)
    ),
    step(
      'raw',
      configFileStep('raw config', 'raw.json', configManagerExportRaw, {
        optional: true,
      })
    ),
    step('remote-servers', () => configManagerExportRemoteServers()),
    step('schedules', () => configManagerExportSchedules()),
    step('scripts', (options) =>
      configManagerExportScripts(undefined, options.realm)
    ),
    step(
      'service-objects',
      configFileStep(
        'service objects',
        'service-objects.json',
        configManagerExportServiceObjectsFromFile
      )
    ),
    step('services', (options) => configManagerExportServices(options.realm)),
    step('terms-and-conditions', () => configManagerExportTermsAndConditions()),
    step('themes', (options) => configManagerExportThemes(options.realm)),
    step('ui-config', () => configManagerExportUiConfig()),
    // The four standalone kinds that leave out what an application owns (decision record 0042) come last, before
    // applications: the layout of the tree is decided before the first step runs (see runSteps), so their position
    // does not matter for that, and the requests they add (the ownership of the applications) come after those of
    // the steps before them (the recorded replays of `pull all` hand out their recordings in order).
    step('connector-definitions', (options) =>
      configManagerExportConnectorDefinitions(
        undefined,
        false,
        options.applicationLayout
      )
    ),
    step(
      'oauth2-agents',
      layoutFileStep('OAuth2 agents', 'oauth2-agents.json', (file, layout) =>
        configManagerExportOAuth2Agents(file, false, layout)
      )
    ),
    step('connector-mappings', (options) =>
      configManagerExportMappings(undefined, false, options.applicationLayout)
    ),
    step(
      'saml',
      layoutFileStep('SAML', 'saml.json', (file, layout) =>
        configManagerExportSaml(file, false, layout)
      )
    ),
    // The last step: it writes the marker of a new tree.
    step('applications', (options) =>
      configManagerExportApplications(
        undefined,
        options.realm,
        true,
        false,
        options.applicationLayout
      )
    ),
  ],
  [CLOUD_DEPLOYMENT_TYPE_KEY]: [
    step('access-config', () => configManagerExportAccessConfig()),
    step('audit', () => configManagerExportAudit()),
    step('authentication', (options) =>
      configManagerExportAuthentication(options.realm)
    ),
    step(
      'authz-policies',
      configFileStep(
        'Authz Policy Sets',
        'authz-policies.json',
        configManagerExportAuthzPolicySets
      )
    ),
    step('cookie-domains', () => configManagerExportCookieDomains()),
    step('cors', () => configManagerExportCors()),
    step('csp', (options) =>
      configManagerExportCsp(
        existingConfigFile(options.configFolder, 'csp-overrides.json')
      )
    ),
    step('custom-nodes', () => configManagerExportCustomNodes()),
    step('email-provider', () =>
      configManagerExportEmailProviderConfiguration()
    ),
    step('email-templates', () => configManagerExportEmailTemplates()),
    step('endpoints', () => configManagerExportEndpoints()),
    step('internal-roles', () => configManagerExportInternalRoles()),
    step('journeys', (options) =>
      configManagerExportJourneys(undefined, options.realm)
    ),
    step('kba', () => configManagerExportKbaConfig()),
    step('locales', () => configManagerExportLocales()),
    step('managed-objects', () =>
      configManagerExportManagedObjects(undefined, true)
    ),
    step('org-privileges', (options) =>
      configManagerExportOrgPrivilegesAllRealms(options.realm)
    ),
    step('password-policy', (options) =>
      configManagerExportPasswordPolicy(options.realm)
    ),
    step(
      'raw',
      configFileStep('raw config', 'raw.json', configManagerExportRaw, {
        optional: true,
      })
    ),
    step('remote-proxies', () =>
      configManagerExportRemoteProxies(undefined, true)
    ),
    step('remote-servers', () => configManagerExportRemoteServers()),
    step('schedules', () => configManagerExportSchedules()),
    step('scripts', (options) =>
      configManagerExportScripts(undefined, options.realm)
    ),
    step('secrets', () => configManagerExportSecrets()),
    step('secret-mappings', (options) =>
      configManagerExportSecretMappings(undefined, options.realm)
    ),
    step(
      'service-objects',
      configFileStep(
        'service objects',
        'service-objects.json',
        configManagerExportServiceObjectsFromFile
      )
    ),
    step('services', (options) => configManagerExportServices(options.realm)),
    step('terms-and-conditions', () => configManagerExportTermsAndConditions()),
    step('themes', (options) => configManagerExportThemes(options.realm)),
    step('ui-config', () => configManagerExportUiConfig()),
    step('variables', () => configManagerExportVariables()),
    // The four standalone kinds that leave out what an application owns (decision record 0042) come last, before
    // applications: the layout of the tree is decided before the first step runs (see runSteps), so their position
    // does not matter for that, and the requests they add (the ownership of the applications) come after those of
    // the steps before them (the recorded replays of `pull all` hand out their recordings in order).
    step('connector-definitions', (options) =>
      configManagerExportConnectorDefinitions(
        undefined,
        false,
        options.applicationLayout
      )
    ),
    step(
      'oauth2-agents',
      layoutFileStep('OAuth2 agents', 'oauth2-agents.json', (file, layout) =>
        configManagerExportOAuth2Agents(file, false, layout)
      )
    ),
    step('connector-mappings', (options) =>
      configManagerExportMappings(undefined, false, options.applicationLayout)
    ),
    step(
      'saml',
      layoutFileStep('SAML', 'saml.json', (file, layout) =>
        configManagerExportSaml(file, false, layout)
      )
    ),
    // The last step: it writes the marker of a new tree.
    step('applications', (options) =>
      configManagerExportApplications(
        undefined,
        options.realm,
        true,
        false,
        options.applicationLayout
      )
    ),
  ],
  [CLASSIC_DEPLOYMENT_TYPE_KEY]: [
    step('authentication', (options) =>
      configManagerExportAuthentication(options.realm)
    ),
    step(
      'authz-policies',
      configFileStep(
        'Authz Policy Sets',
        'authz-policies.json',
        configManagerExportAuthzPolicySets
      )
    ),
    step(
      'oauth2-agents',
      configFileStep(
        'OAuth2 agents',
        'oauth2-agents.json',
        configManagerExportOAuth2Agents
      )
    ),
    step('cors', () => configManagerExportCors()),
    step('custom-nodes', () => configManagerExportCustomNodes()),
    step('journeys', (options) =>
      configManagerExportJourneys(undefined, options.realm)
    ),
    step(
      'raw',
      configFileStep('raw config', 'raw.json', configManagerExportRaw, {
        optional: true,
      })
    ),
    step('saml', configFileStep('SAML', 'saml.json', configManagerExportSaml)),
    step('scripts', (options) =>
      configManagerExportScripts(undefined, options.realm)
    ),
    step('services', (options) => configManagerExportServices(options.realm)),
  ],
};

export const deploymentMapAllStatic: Record<string, ExportStep[]> = {
  [FORGEOPS_DEPLOYMENT_TYPE_KEY]: [
    step('access-config', () => configManagerExportAccessConfig()),
    step('audit', () => configManagerExportAudit()),
    step('authentication', (options) =>
      configManagerExportAuthentication(options.realm)
    ),
    step('connector-definitions', () =>
      configManagerExportConnectorDefinitions()
    ),
    step('cors', () => configManagerExportCors()),
    step('custom-nodes', () => configManagerExportCustomNodes()),
    step('email-provider', () =>
      configManagerExportEmailProviderConfiguration()
    ),
    step('email-templates', () => configManagerExportEmailTemplates()),
    step('endpoints', () => configManagerExportEndpoints()),
    step('idm-authentication', () => configManagerExportIdmAuthentication()),
    step('journeys', (options) =>
      configManagerExportJourneys(undefined, options.realm)
    ),
    step('kba', () => configManagerExportKbaConfig()),
    step('locales', () => configManagerExportLocales()),
    step('managed-objects', () => configManagerExportManagedObjects()),
    step('connector-mappings', () => configManagerExportMappings()),
    step('org-privileges', (options) =>
      configManagerExportOrgPrivilegesAllRealms(options.realm)
    ),
    step('password-policy', (options) =>
      configManagerExportPasswordPolicy(options.realm)
    ),
    step('remote-servers', () => configManagerExportRemoteServers()),
    step('schedules', () => configManagerExportSchedules()),
    step('scripts', (options) =>
      configManagerExportScripts(undefined, options.realm)
    ),
    step('services', (options) => configManagerExportServices(options.realm)),
    step('terms-and-conditions', () => configManagerExportTermsAndConditions()),
    step('themes', (options) => configManagerExportThemes(options.realm)),
    step('ui-config', () => configManagerExportUiConfig()),
  ],
  [CLOUD_DEPLOYMENT_TYPE_KEY]: [
    step('access-config', () => configManagerExportAccessConfig()),
    step('audit', () => configManagerExportAudit()),
    step('authentication', (options) =>
      configManagerExportAuthentication(options.realm)
    ),
    step('connector-definitions', () =>
      configManagerExportConnectorDefinitions()
    ),
    step('cookie-domains', () => configManagerExportCookieDomains()),
    step('cors', () => configManagerExportCors()),
    step('csp', () => configManagerExportCsp()),
    step('custom-nodes', () => configManagerExportCustomNodes()),
    step('email-provider', () =>
      configManagerExportEmailProviderConfiguration()
    ),
    step('email-templates', () => configManagerExportEmailTemplates()),
    step('endpoints', () => configManagerExportEndpoints()),
    step('journeys', (options) =>
      configManagerExportJourneys(undefined, options.realm)
    ),
    step('kba', () => configManagerExportKbaConfig()),
    step('locales', () => configManagerExportLocales()),
    step('managed-objects', () =>
      configManagerExportManagedObjects(undefined, true)
    ),
    step('connector-mappings', () => configManagerExportMappings()),
    step('org-privileges', (options) =>
      configManagerExportOrgPrivilegesAllRealms(options.realm)
    ),
    step('password-policy', (options) =>
      configManagerExportPasswordPolicy(options.realm)
    ),
    step('remote-proxies', () =>
      configManagerExportRemoteProxies(undefined, true)
    ),
    step('remote-servers', () => configManagerExportRemoteServers()),
    step('schedules', () => configManagerExportSchedules()),
    step('scripts', (options) =>
      configManagerExportScripts(undefined, options.realm)
    ),
    step('secret-mappings', (options) =>
      configManagerExportSecretMappings(undefined, options.realm)
    ),
    step('services', (options) => configManagerExportServices(options.realm)),
    step('terms-and-conditions', () => configManagerExportTermsAndConditions()),
    step('themes', (options) => configManagerExportThemes(options.realm)),
    step('ui-config', () => configManagerExportUiConfig()),
  ],
  [CLASSIC_DEPLOYMENT_TYPE_KEY]: [
    step('authentication', (options) =>
      configManagerExportAuthentication(options.realm)
    ),
    step('cors', () => configManagerExportCors()),
    step('custom-nodes', () => configManagerExportCustomNodes()),
    step('journeys', (options) =>
      configManagerExportJourneys(undefined, options.realm)
    ),
    step('scripts', (options) =>
      configManagerExportScripts(undefined, options.realm)
    ),
    step('services', (options) => configManagerExportServices(options.realm)),
  ],
};

export interface ConfigManagerAllOptions {
  configFolder?: string;
  realm?: string;
  /** Report failed steps but succeed anyway (`--allow-failures`, decision record 0040). */
  allowFailures?: boolean;
  /**
   * What the tree is and which layout it uses, decided once before the first step runs (set by
   * the runner, not by the caller): the steps that write at the paths of a kind change the tree,
   * so a step that runs later could not tell a new tree from one that these steps made.
   */
  applicationLayout?: ApplicationLayoutDecision;
}

/**
 * Runs every step even after one failed, prints one summary of the failed
 * steps and answers whether the command succeeded (decision record 0040).
 */
async function runSteps(
  steps: ExportStep[],
  options: ConfigManagerAllOptions
): Promise<boolean> {
  const run = new OperationRun({
    unit: 'step',
    allowFailures: options.allowFailures,
  });
  const stepOptions = withApplicationLayout(steps, options);
  for (const { name, run: stepRun } of steps) {
    await run.run(name, () => stepRun(stepOptions));
  }
  return run.finish();
}

/**
 * Decide the layout of the tree before any step writes into it, for the steps
 * that need it (the `applications` step). A marker that cannot be read is left
 * for the step to report.
 */
function withApplicationLayout(
  steps: ExportStep[],
  options: ConfigManagerAllOptions
): ConfigManagerAllOptions {
  if (!steps.some((s) => s.name === 'applications')) return options;
  try {
    return {
      ...options,
      applicationLayout: decideApplicationLayout(getWorkingDirectory()),
    };
  } catch {
    return options;
  }
}

export async function configManagerExportAllWithConfigFolder(
  options: ConfigManagerAllOptions = {}
): Promise<boolean> {
  try {
    return await runSteps(deploymentMapAll[state.getDeploymentType()], options);
  } catch (error) {
    printError(error, 'Error exporting all in fr-config-manager format');
    return false;
  }
}

export async function configManagerExportAllStatic(
  options: ConfigManagerAllOptions = {}
): Promise<boolean> {
  try {
    return await runSteps(
      deploymentMapAllStatic[state.getDeploymentType()],
      options
    );
  } catch (error) {
    printError(error, 'Error exporting all-static in fr-config-manager format');
    return false;
  }
}
