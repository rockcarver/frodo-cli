import path from 'path';
import { frodo, state } from '@rockcarver/frodo-lib';
import { configManagerExportApplications } from '../ops/ApplicationConfigOps';
import { configManagerExportCIMDProfiles } from '../ops/CIMDProfileConfigOps';
import { configManagerExportTrustedJwtIssuers } from '../ops/OAuth2TrustedJwtIssuerConfigOps';
import { configManagerExportRemoteProxies } from '../ops/RemoteProxyOps';
import { printError, printMessage } from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';
import {
  decideApplicationLayout,
  type ApplicationLayoutDecision,
} from '../utils/TreeLayout';
import {
  configFileOf,
  configFileStep,
  configFolderProblem,
  existingConfigFile,
} from './ConfigFileStep';
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
const layoutFileStep = (
  label: string,
  fileName: string,
  exporter: (
    filePath: string,
    layout?: ApplicationLayoutDecision
  ) => Promise<boolean>
): ExportStep['run'] =>
  Object.assign(
    (options: ConfigManagerAllOptions) =>
      configFileStep(label, fileName, (filePath) =>
        exporter(filePath, options.applicationLayout)
      )(options),
    // what a step made by configFileStep says about itself, see withConfigFolderCheck
    { configFile: { fileName, optional: false } }
  );

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
    step('org-privileges', () => configManagerExportOrgPrivileges()),
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
    // CIMD profiles are dynamic configuration for now, so they are in `pull all` and not in `pull all-static`. The step needs no
    // input: it discovers the profiles of every realm (or of the realm that was given) and says nothing where the deployment or
    // the realm does not offer them. `oauth-cimd-profiles.json` in the config folder is optional.
    step('oauth-cimd-profiles', (options) =>
      configManagerExportCIMDProfiles(
        undefined,
        options.realm,
        true,
        false,
        existingConfigFile(options.configFolder, 'oauth-cimd-profiles.json')
      )
    ),
    // Trusted JWT issuers are dynamic configuration (Ping's promotion FAQ lists them as not promoted), so they are in `pull all`
    // and not in `pull all-static`. No input is needed: the step discovers the issuers of every realm (or of the realm that was
    // given). `oauth-issuers.json` in the config folder is optional.
    step('oauth-issuers', (options) =>
      configManagerExportTrustedJwtIssuers(
        undefined,
        options.realm,
        true,
        false,
        existingConfigFile(options.configFolder, 'oauth-issuers.json')
      )
    ),
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
    step('org-privileges', () => configManagerExportOrgPrivileges()),
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
    // CIMD profiles are dynamic configuration for now, so they are in `pull all` and not in `pull all-static`. The step needs no
    // input: it discovers the profiles of every realm (or of the realm that was given) and says nothing where the deployment or
    // the realm does not offer them. `oauth-cimd-profiles.json` in the config folder is optional.
    step('oauth-cimd-profiles', (options) =>
      configManagerExportCIMDProfiles(
        undefined,
        options.realm,
        true,
        false,
        existingConfigFile(options.configFolder, 'oauth-cimd-profiles.json')
      )
    ),
    // Trusted JWT issuers are dynamic configuration (Ping's promotion FAQ lists them as not promoted), so they are in `pull all`
    // and not in `pull all-static`. No input is needed: the step discovers the issuers of every realm (or of the realm that was
    // given). `oauth-issuers.json` in the config folder is optional.
    step('oauth-issuers', (options) =>
      configManagerExportTrustedJwtIssuers(
        undefined,
        options.realm,
        true,
        false,
        existingConfigFile(options.configFolder, 'oauth-issuers.json')
      )
    ),
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
    // CIMD profiles are dynamic configuration for now, so they are in `pull all` and not in `pull all-static`. The step needs no
    // input: it discovers the profiles of every realm (or of the realm that was given) and says nothing where the deployment or
    // the realm does not offer them. `oauth-cimd-profiles.json` in the config folder is optional.
    step('oauth-cimd-profiles', (options) =>
      configManagerExportCIMDProfiles(
        undefined,
        options.realm,
        true,
        false,
        existingConfigFile(options.configFolder, 'oauth-cimd-profiles.json')
      )
    ),
    // Trusted JWT issuers are dynamic configuration (Ping's promotion FAQ lists them as not promoted), so they are in `pull all`
    // and not in `pull all-static`. No input is needed: the step discovers the issuers of every realm (or of the realm that was
    // given). `oauth-issuers.json` in the config folder is optional.
    step('oauth-issuers', (options) =>
      configManagerExportTrustedJwtIssuers(
        undefined,
        options.realm,
        true,
        false,
        existingConfigFile(options.configFolder, 'oauth-issuers.json')
      )
    ),
  ],
};

// `oauth-cimd-profiles` and `oauth-issuers` are absent from the lists below on purpose: both are dynamic configuration (CIMD
// profiles until Ping says a promotion carries them, trusted JWT issuers because Ping's promotion FAQ lists them as not
// promoted); see the steps in `deploymentMapAll`.
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
    step('org-privileges', () => configManagerExportOrgPrivileges()),
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
    step('org-privileges', () => configManagerExportOrgPrivileges()),
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
  /**
   * Set by the runner, not by the caller: the config folder does not exist or is not a folder, and the
   * runner has said so once, so the steps that read a file from it skip quietly.
   */
  configFolderUnusable?: boolean;
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
 * @param {ExportStep[]} steps the steps of the deployment
 * @param {ConfigManagerAllOptions} options what the command was given
 * @param {{ announceOutput?: boolean }} settings `announceOutput`: say where the files are written, before the
 * first step and again before the summary of failures (the config folder only says where config files are read from)
 * @returns {Promise<boolean>} true if the command succeeded
 */
async function runSteps(
  steps: ExportStep[],
  options: ConfigManagerAllOptions,
  { announceOutput = false }: { announceOutput?: boolean } = {}
): Promise<boolean> {
  const run = new OperationRun({
    unit: 'step',
    allowFailures: options.allowFailures,
  });
  const outputDirectory = announceOutput
    ? path.resolve(getWorkingDirectory())
    : undefined;
  if (outputDirectory) printMessage(`Exporting to ${outputDirectory}`, 'info');
  const stepOptions = withConfigFolderCheck(
    steps,
    withApplicationLayout(steps, options)
  );
  for (const { name, run: stepRun } of steps) {
    await run.run(name, () => stepRun(stepOptions));
  }
  if (outputDirectory) printMessage(`Exported to ${outputDirectory}`, 'info');
  return run.finish();
}

/**
 * Say once that the config folder is not there, instead of once per step that reads a file from it. A
 * config folder that does not exist is almost always a mistyped path. The steps still skip and still
 * succeed (decision record 0040): they just do not repeat the warning. A folder that exists but lacks a
 * file keeps one warning per missing file.
 * @param {ExportStep[]} steps the steps of the deployment
 * @param {ConfigManagerAllOptions} options what the command was given
 * @returns {ConfigManagerAllOptions} the options for the steps
 */
function withConfigFolderCheck(
  steps: ExportStep[],
  options: ConfigManagerAllOptions
): ConfigManagerAllOptions {
  const problem = configFolderProblem(options.configFolder);
  if (!problem) return options;
  const skipped = steps
    .filter(({ run }) => {
      const file = configFileOf(run);
      return file && !file.optional;
    })
    .map(({ name }) => name)
    .sort();
  if (skipped.length > 0) {
    printMessage(
      `The config folder '${options.configFolder}' ${
        problem === 'missing' ? 'does not exist' : 'is not a folder'
      }, so the steps that read a file from it are skipped: ${skipped.join(', ')}.`,
      'warn'
    );
  }
  return { ...options, configFolderUnusable: true };
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
    return await runSteps(
      deploymentMapAll[state.getDeploymentType()],
      options,
      {
        announceOutput: true,
      }
    );
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
