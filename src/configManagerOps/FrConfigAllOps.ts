import fs from 'fs';
import path from 'path';
import { frodo, state } from '@rockcarver/frodo-lib';
import { configManagerExportApplications } from '../ops/ApplicationConfigOps';
import { configManagerExportCIMDProfiles } from '../ops/CIMDProfileConfigOps';
import { configManagerExportTrustedJwtIssuers } from '../ops/OAuth2TrustedJwtIssuerConfigOps';
import {
  configManagerExportRemoteProxies,
  configManagerImportRemoteProxies,
} from '../ops/RemoteProxyOps';
import { configManagerExportSoftwarePublishers } from '../ops/SoftwarePublisherConfigOps';
import { realmFolderOf } from '../utils/ConfigTreePath';
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
import {
  configManagerExportAccessConfig,
  configManagerImportAccessConfig,
} from './FrConfigAccessConfigOps';
import {
  configManagerExportAudit,
  configManagerImportAudit,
} from './FrConfigAuditOps';
import {
  configManagerExportAuthentication,
  configManagerImportAuthentication,
} from './FrConfigAuthenticationOps';
import { configManagerExportAuthzPolicySets } from './FrConfigAuthzPoliciesOps';
import {
  configManagerExportConnectorDefinitions,
  configManagerImportConnectors,
} from './FrConfigConnectorDefinitionsOps';
import {
  configManagerExportMappings,
  configManagerImportMappings,
} from './FrConfigConnectorMappingOps';
import {
  configManagerExportCookieDomains,
  configManagerImportCookieDomains,
} from './FrConfigCookieDomainsOps';
import {
  configManagerExportCors,
  configManagerImportCors,
} from './FrConfigCorsOps';
import {
  configManagerExportCsp,
  configManagerImportCsp,
} from './FrConfigCspOps';
import {
  configManagerExportCustomNodes,
  configManagerImportCustomNodes,
} from './FrConfigCustomNodesOps';
import {
  configManagerExportEmailProviderConfiguration,
  configManagerImportEmailProvider,
} from './FrConfigEmailProviderOps';
import {
  configManagerExportEmailTemplates,
  configManagerImportEmailTemplates,
} from './FrConfigEmailTemplatesOps';
import {
  configManagerExportEndpoints,
  configManagerImportEndpoints,
} from './FrConfigEndpointsOps';
import {
  configManagerExportIdmAuthentication,
  configManagerImportIdmAuthentication,
} from './FrConfigIdmAuthenticationOpts';
import { configManagerExportInternalRoles } from './FrConfigInternalRolesOps';
import {
  configManagerExportJourneys,
  configManagerImportJourneys,
} from './FrConfigJourneysOps';
import {
  configManagerExportKbaConfig,
  configManagerImportKbaConfig,
} from './FrConfigKbaOps';
import {
  configManagerExportLocales,
  configManagerImportLocales,
} from './FrConfigLocalesOps';
import {
  configManagerExportManagedObjects,
  configManagerImportManagedObjects,
} from './FrConfigManagedObjectsOps';
import { configManagerImportMetadata } from './FrConfigMetadataOps';
import { configManagerExportOAuth2Agents } from './FrConfigOauth2AgentOps';
import {
  configManagerExportOrgPrivileges,
  configManagerImportOrgPrivileges,
} from './FrConfigOrgPrivilegesOps';
import {
  configManagerExportPasswordPolicy,
  configManagerImportPasswordPolicy,
} from './FrConfigPasswordPolicyOps';
import { configManagerExportRaw } from './FrConfigRawOps';
import {
  configManagerExportRemoteServers,
  configManagerImportRemoteServers,
} from './FrConfigRemoteServersOps';
import { configManagerExportSaml } from './FrConfigSamlOps';
import {
  configManagerExportSchedules,
  configManagerImportSchedules,
} from './FrConfigSchedulesOps';
import {
  configManagerExportScripts,
  configManagerImportScripts,
} from './FrConfigScriptOps';
import {
  configManagerExportSecretMappings,
  configManagerImportSecretMappings,
} from './FrConfigSecretMappingsOps';
import { configManagerExportSecrets } from './FrConfigSecretOps';
import { configManagerExportServiceObjectsFromFile } from './FrConfigServiceObjectsOps';
import {
  configManagerExportServices,
  configManagerImportServices,
} from './FrConfigServiceOps';
import {
  configManagerExportTermsAndConditions,
  configManagerImportTermsAndConditions,
} from './FrConfigTermsAndConditionsOps';
import {
  configManagerExportThemes,
  configManagerImportThemes,
} from './FrConfigThemeOps';
import {
  configManagerExportUiConfig,
  configManagerImportUiConfig,
} from './FrConfigUiConfigOps';
import { configManagerExportVariables } from './FrConfigVariableOps';

const {
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const { DEFAULT_REALM_KEY } = frodo.utils.constants;

const { getWorkingDirectory } = frodo.utils;

/** Which operation to run for a step. */
export type StepOperation = 'export' | 'import';

/** What one step does for an operation. */
export type StepRun = (
  options: ConfigManagerAllOptions
) => Promise<boolean | void>;

/**
 * One step of `config pull all`, `pull all-static` or `push all-static`.
 */
export interface AllStep {
  /**
   * The name of the `config-manager` command that does the same, as shown in the summary of failed
   * steps.
   */
  name: string;
  /**
   * What `pull all` and `pull all-static` run for the step. Answers false when the step failed (it
   * has printed its own error).
   */
  export?: StepRun;
  /**
   * What `push all-static` runs for the step. Answers false when the step failed (it has printed its
   * own error).
   */
  import?: StepRun;
  /**
   * Whether the step applies to this run at all. A step that does not apply is not planned: it does
   * not run, it is not counted in the summary and it says nothing. Without it the step always applies.
   */
  when?: (options: ConfigManagerAllOptions) => boolean;
  /**
   * What the import of the step reads from the tree: the paths, relative to the working directory,
   * that it needs. A `*` as a path segment stands for any folder of that level (`realms/*` is every
   * realm folder of the tree). The step is skipped with a warning when none of its paths is there:
   * what a command finds by convention may be absent, and that is neither a success nor a failure
   * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0041-the-config-manager-plain-form-is-what-an-unattended-pipeline-needs.md,
   * the plain form of a command and what it finds by convention). A path that is there but cannot be
   * read or parsed is the failure of the step. Without it the step always runs.
   */
  reads?: (options: ConfigManagerAllOptions) => string[];
}

/**
 * Makes a step. If a single function provided, it's assumed to be an export step,
 * otherwise the object specifies what the step does per operation
 */
const step = (name: string, run: StepRun | Omit<AllStep, 'name'>): AllStep =>
  typeof run === 'function' ? { name, export: run } : { name, ...run };

/**
 * The `reads` of an import that reads the same paths whatever the realm.
 * @param {string[]} paths the paths, relative to the working directory
 * @returns {(options: ConfigManagerAllOptions) => string[]} the `reads` of the step
 */
const readsPaths =
  (...paths: string[]) =>
  (): string[] =>
    paths;

/**
 * The `reads` of an import that reads a path inside the folder of a realm: the folder of the realm that
 * was named, or every realm folder of the tree when none was.
 * @param {string} inRealm the path inside `realms/<realm>/`
 * @returns {(options: ConfigManagerAllOptions) => string[]} the `reads` of the step
 */
const readsInRealm =
  (inRealm: string) =>
  (options: ConfigManagerAllOptions): string[] => {
    const named = !!options.realm && options.realm !== DEFAULT_REALM_KEY;
    const folder = named ? realmFolderOf(options.realm) : '*';
    return [`realms/${folder}/${inRealm}`];
  };

/**
 * The `when` of the `config-metadata` step: it writes the metadata of the tenant only when the run was given some
 * (at least one property). Without them the tenant keeps the metadata it has, and the step does not run.
 * @param {ConfigManagerAllOptions} options what the command was given
 * @returns {boolean} true if there is metadata to write
 */
const metadataWasGiven = (options: ConfigManagerAllOptions): boolean =>
  !!options.metadata && Object.keys(options.metadata).length > 0;

/**
 * A step that reads a file from the config folder, like {@link configFileStep}, and pulls everything
 * when the file is not there: the file selects what is pulled, and without it the exporter gets
 * `null`. The exporter also gets the options of the run: the realm that narrows a pull without a
 * file, and the layout decision of `pull all` (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0042-config-manager-keeps-everything-an-application-owns-in-one-folder.md,
 * everything an application owns in one folder), which the standalone commands that the decision
 * concerns use to leave out what an application owns.
 */
const everythingFileStep = (
  label: string,
  fileName: string,
  exporter: (
    filePath: string | null,
    options: ConfigManagerAllOptions
  ) => Promise<boolean>
): StepRun =>
  Object.assign(
    (options: ConfigManagerAllOptions) =>
      configFileStep(
        label,
        fileName,
        (filePath) => exporter(filePath, options),
        {
          absentMeansAll: true,
        }
      )(options),
    // what a step made by configFileStep says about itself, see withConfigFolderCheck
    { configFile: { fileName, optional: false, absentMeansAll: true } }
  );

export const deploymentMapAll: Record<string, AllStep[]> = {
  [FORGEOPS_DEPLOYMENT_TYPE_KEY]: [
    step('access-config', () => configManagerExportAccessConfig()),
    step('audit', () => configManagerExportAudit()),
    step('authn', (options) =>
      configManagerExportAuthentication(options.realm)
    ),
    step(
      'authz-policies',
      everythingFileStep(
        'Authz Policy Sets',
        'authz-policies.json',
        (file, options) =>
          configManagerExportAuthzPolicySets(file, false, options.realm)
      )
    ),
    step('cors', () => configManagerExportCors()),
    step('nodes', () => configManagerExportCustomNodes()),
    step('email-provider', () =>
      configManagerExportEmailProviderConfiguration()
    ),
    step('email-templates', () => configManagerExportEmailTemplates()),
    step('endpoints', () => configManagerExportEndpoints()),
    step('internal-roles', () => configManagerExportInternalRoles()),
    step('journeys', (options) =>
      configManagerExportJourneys(undefined, options.realm, false)
    ),
    step('kba', () => configManagerExportKbaConfig()),
    step('locales', () => configManagerExportLocales()),
    step('managed-objects', () => configManagerExportManagedObjects()),
    step('org-privileges', (options) =>
      configManagerExportOrgPrivileges(undefined, false, options.realm)
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
    step('connector-servers', () => configManagerExportRemoteServers()),
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
    // Software publishers are dynamic configuration too (Ping's promotion FAQ lists them as not promoted), so they are in
    // `pull all` and not in `pull all-static`. No input is needed: the step discovers the publishers of every realm (or of
    // the realm that was given). `oauth-software-publishers.json` in the config folder is optional.
    step('oauth-software-publishers', (options) =>
      configManagerExportSoftwarePublishers(
        undefined,
        options.realm,
        true,
        false,
        existingConfigFile(
          options.configFolder,
          'oauth-software-publishers.json'
        )
      )
    ),
    // The four standalone kinds that leave out what an application owns (decision record 0042) come last, before
    // applications: the layout of the tree is decided before the first step runs (see runSteps), so their position
    // does not matter for that, and the requests they add (the ownership of the applications) come after those of
    // the steps before them (the recorded replays of `pull all` hand out their recordings in order).
    step('connectors', (options) =>
      configManagerExportConnectorDefinitions(
        undefined,
        false,
        options.applicationLayout
      )
    ),
    step(
      'oauth2-agents',
      everythingFileStep(
        'OAuth2 agents',
        'oauth2-agents.json',
        (file, options) =>
          configManagerExportOAuth2Agents(
            file,
            false,
            options.applicationLayout,
            options.realm
          )
      )
    ),
    step('connector-mappings', (options) =>
      configManagerExportMappings(undefined, false, options.applicationLayout)
    ),
    step(
      'saml',
      everythingFileStep('SAML', 'saml.json', (file, options) =>
        configManagerExportSaml(
          file,
          false,
          options.applicationLayout,
          options.realm
        )
      )
    ),
    // The last step: it writes the marker of a new tree.
    step('apps', (options) =>
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
    step('authn', (options) =>
      configManagerExportAuthentication(options.realm)
    ),
    step(
      'authz-policies',
      everythingFileStep(
        'Authz Policy Sets',
        'authz-policies.json',
        (file, options) =>
          configManagerExportAuthzPolicySets(file, false, options.realm)
      )
    ),
    step('cookie-domains', () => configManagerExportCookieDomains()),
    step('cors', () => configManagerExportCors()),
    step('csp', (options) =>
      configManagerExportCsp(
        existingConfigFile(options.configFolder, 'csp-overrides.json')
      )
    ),
    step('nodes', () => configManagerExportCustomNodes()),
    step('email-provider', () =>
      configManagerExportEmailProviderConfiguration()
    ),
    step('email-templates', () => configManagerExportEmailTemplates()),
    step('endpoints', () => configManagerExportEndpoints()),
    step('internal-roles', () => configManagerExportInternalRoles()),
    step('journeys', (options) =>
      configManagerExportJourneys(undefined, options.realm, false)
    ),
    step('kba', () => configManagerExportKbaConfig()),
    step('locales', () => configManagerExportLocales()),
    step('managed-objects', () =>
      configManagerExportManagedObjects(undefined, true)
    ),
    step('org-privileges', (options) =>
      configManagerExportOrgPrivileges(undefined, false, options.realm)
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
    step('connector-servers', () => configManagerExportRemoteServers()),
    step('schedules', () => configManagerExportSchedules()),
    step('scripts', (options) =>
      configManagerExportScripts(undefined, options.realm)
    ),
    step('secrets', () => configManagerExportSecrets()),
    step('secretstore-mappings', (options) =>
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
    // Software publishers are dynamic configuration too (Ping's promotion FAQ lists them as not promoted), so they are in
    // `pull all` and not in `pull all-static`. No input is needed: the step discovers the publishers of every realm (or of
    // the realm that was given). `oauth-software-publishers.json` in the config folder is optional.
    step('oauth-software-publishers', (options) =>
      configManagerExportSoftwarePublishers(
        undefined,
        options.realm,
        true,
        false,
        existingConfigFile(
          options.configFolder,
          'oauth-software-publishers.json'
        )
      )
    ),
    // The four standalone kinds that leave out what an application owns (decision record 0042) come last, before
    // applications: the layout of the tree is decided before the first step runs (see runSteps), so their position
    // does not matter for that, and the requests they add (the ownership of the applications) come after those of
    // the steps before them (the recorded replays of `pull all` hand out their recordings in order).
    step('connectors', (options) =>
      configManagerExportConnectorDefinitions(
        undefined,
        false,
        options.applicationLayout
      )
    ),
    step(
      'oauth2-agents',
      everythingFileStep(
        'OAuth2 agents',
        'oauth2-agents.json',
        (file, options) =>
          configManagerExportOAuth2Agents(
            file,
            false,
            options.applicationLayout,
            options.realm
          )
      )
    ),
    step('connector-mappings', (options) =>
      configManagerExportMappings(undefined, false, options.applicationLayout)
    ),
    step(
      'saml',
      everythingFileStep('SAML', 'saml.json', (file, options) =>
        configManagerExportSaml(
          file,
          false,
          options.applicationLayout,
          options.realm
        )
      )
    ),
    // The last step: it writes the marker of a new tree.
    step('apps', (options) =>
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
    step('authn', (options) =>
      configManagerExportAuthentication(options.realm)
    ),
    step(
      'authz-policies',
      everythingFileStep(
        'Authz Policy Sets',
        'authz-policies.json',
        (file, options) =>
          configManagerExportAuthzPolicySets(file, false, options.realm)
      )
    ),
    step(
      'oauth2-agents',
      everythingFileStep(
        'OAuth2 agents',
        'oauth2-agents.json',
        (file, options) =>
          configManagerExportOAuth2Agents(
            file,
            false,
            options.applicationLayout,
            options.realm
          )
      )
    ),
    step('cors', () => configManagerExportCors()),
    step('nodes', () => configManagerExportCustomNodes()),
    step('journeys', (options) =>
      configManagerExportJourneys(undefined, options.realm, false)
    ),
    step(
      'raw',
      configFileStep('raw config', 'raw.json', configManagerExportRaw, {
        optional: true,
      })
    ),
    step(
      'saml',
      everythingFileStep('SAML', 'saml.json', (file, options) =>
        configManagerExportSaml(
          file,
          false,
          options.applicationLayout,
          options.realm
        )
      )
    ),
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
    // Software publishers are dynamic configuration too (Ping's promotion FAQ lists them as not promoted), so they are in
    // `pull all` and not in `pull all-static`. No input is needed: the step discovers the publishers of every realm (or of
    // the realm that was given). `oauth-software-publishers.json` in the config folder is optional.
    step('oauth-software-publishers', (options) =>
      configManagerExportSoftwarePublishers(
        undefined,
        options.realm,
        true,
        false,
        existingConfigFile(
          options.configFolder,
          'oauth-software-publishers.json'
        )
      )
    ),
  ],
};

/**
 * `oauth-cimd-profiles`, `oauth-issuers` and `oauth-software-publishers` are absent from the lists below on purpose: all
 * three are dynamic configuration (CIMD profiles until Ping says a promotion carries them, trusted JWT issuers and software
 * publishers because Ping's promotion FAQ lists them as not promoted); see the steps in `deploymentMapAll`.
 *
 * A step with an `export` is what `pull all-static` runs, a step with an `import` is what `push all-static` runs, and
 * each type of the pull has its import: the two lists of step names are the same for a deployment type, apart from
 * `config-metadata`, which only a push writes and only when it is asked for (`when`). Every import has the paths it reads
 * (`reads`), so that a type whose folder is not in the tree is skipped.
 *
 * The order below is the one that `push all-static` was first written with: the configuration of the tenant first, then the
 * configuration of the realm, starting with the scripts that the other realm steps refer to, and `scripts` before
 * `authn`, `services` and `journeys`. Two pairs of it are not verified: `connector-mappings` is pushed before
 * `managed-objects` (a mapping names managed types, so the reference runs the other way) and `authn` before
 * `journeys`. The order is kept, and whether a tenant accepts it was not tried against a tenant. `pull all-static` runs
 * its steps in this order too.
 */
export const deploymentMapAllStatic: Record<string, AllStep[]> = {
  [FORGEOPS_DEPLOYMENT_TYPE_KEY]: [
    // Global configurations first
    step('access-config', {
      export: () => configManagerExportAccessConfig(),
      import: () => configManagerImportAccessConfig(),
      reads: readsPaths('access-config/access.json'),
    }),
    step('audit', {
      export: () => configManagerExportAudit(),
      import: () => configManagerImportAudit(),
      reads: readsPaths('audit/audit.json'),
    }),
    step('config-metadata', {
      import: (options) => configManagerImportMetadata(options.metadata),
      when: metadataWasGiven,
    }),
    step('connectors', {
      export: () => configManagerExportConnectorDefinitions(),
      import: () => configManagerImportConnectors(),
      reads: readsPaths('sync/connectors'),
    }),
    step('connector-mappings', {
      export: () => configManagerExportMappings(),
      import: () => configManagerImportMappings(),
      reads: readsPaths('sync/mappings'),
    }),
    step('cors', {
      export: () => configManagerExportCors(),
      import: () => configManagerImportCors(),
      reads: readsPaths('cors/cors-config.json'),
    }),
    step('nodes', {
      export: () => configManagerExportCustomNodes(),
      import: () => configManagerImportCustomNodes(),
      reads: readsPaths('custom-nodes/nodes'),
    }),
    step('email-provider', {
      export: () => configManagerExportEmailProviderConfiguration(),
      import: () => configManagerImportEmailProvider(),
      reads: readsPaths('email-provider/external.email.json'),
    }),
    step('email-templates', {
      export: () => configManagerExportEmailTemplates(),
      import: () => configManagerImportEmailTemplates(),
      reads: readsPaths('email-templates'),
    }),
    step('endpoints', {
      export: () => configManagerExportEndpoints(),
      import: () => configManagerImportEndpoints(),
      reads: readsPaths('endpoints'),
    }),
    step('idm-authentication', {
      export: () => configManagerExportIdmAuthentication(),
      import: () => configManagerImportIdmAuthentication(),
      reads: readsPaths('idm-authentication-config/authentication.json'),
    }),
    step('kba', {
      export: () => configManagerExportKbaConfig(),
      import: () => configManagerImportKbaConfig(),
      reads: readsPaths('kba/selfservice.kba.json'),
    }),
    step('locales', {
      export: () => configManagerExportLocales(),
      import: () => configManagerImportLocales(),
      reads: readsPaths('locales'),
    }),
    step('managed-objects', {
      export: () => configManagerExportManagedObjects(),
      import: () => configManagerImportManagedObjects(),
      reads: readsPaths('managed-objects'),
    }),
    step('org-privileges', {
      export: (options) =>
        configManagerExportOrgPrivileges(undefined, false, options.realm),
      import: () => configManagerImportOrgPrivileges(),
      reads: readsPaths('org-privileges'),
    }),
    step('password-policy', {
      export: (options) => configManagerExportPasswordPolicy(options.realm),
      import: (options) => configManagerImportPasswordPolicy(options.realm),
      reads: readsInRealm('password-policy'),
    }),
    step('connector-servers', {
      export: () => configManagerExportRemoteServers(),
      import: () => configManagerImportRemoteServers(),
      reads: readsPaths(
        'sync/rcs/provisioner.openicf.connectorinfoprovider.json'
      ),
    }),
    step('schedules', {
      export: () => configManagerExportSchedules(),
      import: () => configManagerImportSchedules(),
      reads: readsPaths('schedules'),
    }),
    step('terms-and-conditions', {
      export: () => configManagerExportTermsAndConditions(),
      import: () => configManagerImportTermsAndConditions(),
      reads: readsPaths('terms-conditions/terms-conditions.json'),
    }),
    step('themes', {
      export: (options) => configManagerExportThemes(options.realm),
      import: (options) => configManagerImportThemes(options.realm),
      reads: readsInRealm('themes'),
    }),
    step('ui-config', {
      export: () => configManagerExportUiConfig(),
      import: () => configManagerImportUiConfig(),
      reads: readsPaths('ui/ui-configuration.json'),
    }),
    // Realm configurations after global configurations, starting with scripts since they are used as dependencies for other configurations
    step('scripts', {
      export: (options) => configManagerExportScripts(undefined, options.realm),
      import: (options) => configManagerImportScripts(options.realm),
      reads: readsInRealm('scripts/scripts-config'),
    }),
    step('authn', {
      export: (options) => configManagerExportAuthentication(options.realm),
      import: (options) => configManagerImportAuthentication(options.realm),
      reads: readsInRealm('realm-config/authentication.json'),
    }),
    step('services', {
      export: (options) => configManagerExportServices(options.realm),
      import: (options) =>
        configManagerImportServices(undefined, options.realm),
      reads: readsInRealm('services'),
    }),
    step('journeys', {
      export: (options) =>
        configManagerExportJourneys(undefined, options.realm, false),
      import: (options) =>
        configManagerImportJourneys(undefined, options.realm, false),
      reads: readsInRealm('journeys'),
    }),
  ],
  [CLOUD_DEPLOYMENT_TYPE_KEY]: [
    // Global configurations first
    step('access-config', {
      export: () => configManagerExportAccessConfig(),
      import: () => configManagerImportAccessConfig(),
      reads: readsPaths('access-config/access.json'),
    }),
    step('audit', {
      export: () => configManagerExportAudit(),
      import: () => configManagerImportAudit(),
      reads: readsPaths('audit/audit.json'),
    }),
    step('config-metadata', {
      import: (options) => configManagerImportMetadata(options.metadata),
      when: metadataWasGiven,
    }),
    step('connectors', {
      export: () => configManagerExportConnectorDefinitions(),
      import: () => configManagerImportConnectors(),
      reads: readsPaths('sync/connectors'),
    }),
    step('connector-mappings', {
      export: () => configManagerExportMappings(),
      import: () => configManagerImportMappings(),
      reads: readsPaths('sync/mappings'),
    }),
    step('cookie-domains', {
      export: () => configManagerExportCookieDomains(),
      import: () => configManagerImportCookieDomains(),
      reads: readsPaths('cookie-domains/cookie-domains.json'),
    }),
    step('cors', {
      export: () => configManagerExportCors(),
      import: () => configManagerImportCors(),
      reads: readsPaths('cors/cors-config.json'),
    }),
    step('csp', {
      export: () => configManagerExportCsp(),
      // both policies, as `push csp` without a name does. Like every other step, it is not told about
      // `--allow-failures`: a policy that fails is the failure of this step, and the one summary of the run
      // names it (told, the step would count as a success and the summary would leave it out)
      import: () => configManagerImportCsp(),
      reads: readsPaths('csp/csp.json'),
    }),
    step('nodes', {
      export: () => configManagerExportCustomNodes(),
      import: () => configManagerImportCustomNodes(),
      reads: readsPaths('custom-nodes/nodes'),
    }),
    step('email-provider', {
      export: () => configManagerExportEmailProviderConfiguration(),
      import: () => configManagerImportEmailProvider(),
      reads: readsPaths('email-provider/external.email.json'),
    }),
    step('email-templates', {
      export: () => configManagerExportEmailTemplates(),
      import: () => configManagerImportEmailTemplates(),
      reads: readsPaths('email-templates'),
    }),
    step('endpoints', {
      export: () => configManagerExportEndpoints(),
      import: () => configManagerImportEndpoints(),
      reads: readsPaths('endpoints'),
    }),
    step('kba', {
      export: () => configManagerExportKbaConfig(),
      import: () => configManagerImportKbaConfig(),
      reads: readsPaths('kba/selfservice.kba.json'),
    }),
    step('locales', {
      export: () => configManagerExportLocales(),
      import: () => configManagerImportLocales(),
      reads: readsPaths('locales'),
    }),
    step('managed-objects', {
      export: () => configManagerExportManagedObjects(undefined, true),
      import: () => configManagerImportManagedObjects(),
      reads: readsPaths('managed-objects'),
    }),
    step('org-privileges', {
      export: (options) =>
        configManagerExportOrgPrivileges(undefined, false, options.realm),
      import: () => configManagerImportOrgPrivileges(),
      reads: readsPaths('org-privileges'),
    }),
    step('password-policy', {
      export: (options) => configManagerExportPasswordPolicy(options.realm),
      import: (options) => configManagerImportPasswordPolicy(options.realm),
      reads: readsInRealm('password-policy'),
    }),
    step('remote-proxies', {
      export: () => configManagerExportRemoteProxies(undefined, true),
      import: () => configManagerImportRemoteProxies(),
      reads: readsPaths('remote-proxies'),
    }),
    step('connector-servers', {
      export: () => configManagerExportRemoteServers(),
      import: () => configManagerImportRemoteServers(),
      reads: readsPaths(
        'sync/rcs/provisioner.openicf.connectorinfoprovider.json'
      ),
    }),
    step('schedules', {
      export: () => configManagerExportSchedules(),
      import: () => configManagerImportSchedules(),
      reads: readsPaths('schedules'),
    }),
    step('terms-and-conditions', {
      export: () => configManagerExportTermsAndConditions(),
      import: () => configManagerImportTermsAndConditions(),
      reads: readsPaths('terms-conditions/terms-conditions.json'),
    }),
    step('themes', {
      export: (options) => configManagerExportThemes(options.realm),
      import: (options) => configManagerImportThemes(options.realm),
      reads: readsInRealm('themes'),
    }),
    step('ui-config', {
      export: () => configManagerExportUiConfig(),
      import: () => configManagerImportUiConfig(),
      reads: readsPaths('ui/ui-configuration.json'),
    }),
    // Realm configurations after global configurations, starting with scripts since they are used as dependencies for other configurations
    step('secretstore-mappings', {
      export: (options) =>
        configManagerExportSecretMappings(undefined, options.realm),
      import: (options) =>
        configManagerImportSecretMappings(undefined, options.realm),
      reads: readsInRealm('secret-mappings'),
    }),
    step('scripts', {
      export: (options) => configManagerExportScripts(undefined, options.realm),
      import: (options) => configManagerImportScripts(options.realm),
      reads: readsInRealm('scripts/scripts-config'),
    }),
    step('authn', {
      export: (options) => configManagerExportAuthentication(options.realm),
      import: (options) => configManagerImportAuthentication(options.realm),
      reads: readsInRealm('realm-config/authentication.json'),
    }),
    step('services', {
      export: (options) => configManagerExportServices(options.realm),
      import: (options) =>
        configManagerImportServices(undefined, options.realm),
      reads: readsInRealm('services'),
    }),
    step('journeys', {
      export: (options) =>
        configManagerExportJourneys(undefined, options.realm, false),
      import: (options) =>
        configManagerImportJourneys(undefined, options.realm, false),
      reads: readsInRealm('journeys'),
    }),
  ],
  [CLASSIC_DEPLOYMENT_TYPE_KEY]: [
    // Global configurations first
    step('cors', {
      export: () => configManagerExportCors(),
      import: () => configManagerImportCors(),
      reads: readsPaths('cors/cors-config.json'),
    }),
    step('nodes', {
      export: () => configManagerExportCustomNodes(),
      import: () => configManagerImportCustomNodes(),
      reads: readsPaths('custom-nodes/nodes'),
    }),
    // Realm configurations after global configurations, starting with scripts since they are used as dependencies for other configurations
    step('scripts', {
      export: (options) => configManagerExportScripts(undefined, options.realm),
      import: (options) => configManagerImportScripts(options.realm),
      reads: readsInRealm('scripts/scripts-config'),
    }),
    step('authn', {
      export: (options) => configManagerExportAuthentication(options.realm),
      import: (options) => configManagerImportAuthentication(options.realm),
      reads: readsInRealm('realm-config/authentication.json'),
    }),
    step('services', {
      export: (options) => configManagerExportServices(options.realm),
      import: (options) =>
        configManagerImportServices(undefined, options.realm),
      reads: readsInRealm('services'),
    }),
    step('journeys', {
      export: (options) =>
        configManagerExportJourneys(undefined, options.realm, false),
      import: (options) =>
        configManagerImportJourneys(undefined, options.realm, false),
      reads: readsInRealm('journeys'),
    }),
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
  /**
   * The metadata of the tenant that a push writes to `custom-config.metadata`: the properties the run was given. The
   * `config-metadata` step runs only when there is at least one (see `when` of the step), so that a push without any
   * leaves the metadata of the tenant as it is. A classic deployment has no such step.
   */
  metadata?: object;
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
 * Whether a path of the tree is there. A `*` segment stands for any folder of its level, so that
 * `realms/*` is there when the tree has a realm folder with the rest of the path in it.
 * @param {string} base the folder to look in
 * @param {string[]} segments the segments of the path that are left
 * @returns {boolean} true if the path is there
 */
function pathIsThere(base: string, segments: string[]): boolean {
  if (segments.length === 0) return true;
  const [first, ...rest] = segments;
  if (first === '*') {
    try {
      return fs
        .readdirSync(base, { withFileTypes: true })
        .some(
          (entry) =>
            entry.isDirectory() &&
            pathIsThere(path.join(base, entry.name), rest)
        );
    } catch {
      // what is there is a file, not a folder: no folder of this level
      return false;
    }
  }
  const next = path.join(base, first);
  return fs.existsSync(next) && pathIsThere(next, rest);
}

/**
 * Works out, before anything is written, what a push of the tree can do: the working directory has to be a
 * folder, a step whose `reads` are not in the tree is skipped with a warning (neither a success nor a
 * failure), and a tree that holds none of them is an error. The step that has no `reads` (the metadata,
 * which the run asked for) is not a reason to go on: it never makes an empty tree a tree.
 * @param {AllStep[]} planned the steps that apply to this run
 * @param {ConfigManagerAllOptions} options what the command was given
 * @returns {AllStep[] | undefined} the steps to run, or undefined after the error was printed
 */
function stepsToPush(
  planned: AllStep[],
  options: ConfigManagerAllOptions
): AllStep[] | undefined {
  const directory = getWorkingDirectory();
  const problem = configFolderProblem(directory);
  if (problem) {
    printMessage(
      `The folder '${directory}' ${
        problem === 'missing' ? 'does not exist' : 'is not a folder'
      }, so there is nothing to push.`,
      'error'
    );
    return undefined;
  }
  const absent = new Map<AllStep, string[]>();
  for (const s of planned) {
    const paths = s.reads?.(options);
    if (paths && !paths.some((p) => pathIsThere(directory, p.split('/')))) {
      absent.set(s, paths);
    }
  }
  const looking = planned.filter((s) => s.reads);
  if (looking.length > 0 && absent.size === looking.length) {
    printMessage(
      `Nothing to push: none of the static configuration folders was found in '${directory}'.`,
      'error'
    );
    return undefined;
  }
  for (const [s, paths] of absent) {
    printMessage(
      `Skipping ${s.name}: '${paths.join("', '")}' not found in '${directory}'.`,
      'warn'
    );
  }
  return planned.filter((s) => !absent.has(s));
}

/**
 * Runs every step even after one failed, prints one summary of the failed
 * steps and answers whether the command succeeded (decision record 0040).
 * A push checks the tree before it writes anything (see {@link stepsToPush}), and the steps it skips
 * are not run and not counted.
 * @param {AllStep[]} steps the steps of the deployment
 * @param {ConfigManagerAllOptions} options what the command was given
 * @param {StepOperation} operation the operation to run for the steps
 * @param {boolean} announceOutput say where the files are written (or read from, on import), before the first step
 * and again before the summary of failures (the config folder only says where config files are read from)
 * @returns {Promise<boolean>} true if the command succeeded
 */
async function runSteps(
  steps: AllStep[],
  options: ConfigManagerAllOptions,
  operation: StepOperation = 'export',
  announceOutput: boolean = false
): Promise<boolean> {
  const run = new OperationRun({
    unit: 'step',
    allowFailures: options.allowFailures,
  });
  const exporting = operation === 'export';
  const outputDirectory = announceOutput
    ? path.resolve(getWorkingDirectory())
    : undefined;
  const announce = (message: string) => {
    if (outputDirectory) printMessage(`${message} ${outputDirectory}`, 'info');
  };
  if (exporting) announce('Exporting to');
  // The config folder and the layout of the tree only matter to what a pull writes and reads.
  const stepOptions = exporting
    ? withConfigFolderCheck(steps, withApplicationLayout(steps, options))
    : options;
  // Filter out any steps where the operation is not defined or that do not apply to this run
  const planned = steps.filter(
    (s) => s[operation] && (s.when?.(stepOptions) ?? true)
  );
  let toRun = planned;
  if (!exporting) {
    toRun = stepsToPush(planned, stepOptions);
    if (!toRun) return false;
    announce('Importing from');
  }
  for (const s of toRun) {
    await run.run(s.name, () => s[operation](stepOptions));
  }
  announce(exporting ? 'Exported to' : 'Imported from');
  return run.finish();
}

/**
 * Say once that the config folder is not there, instead of once per step that reads a file from it. A
 * config folder that does not exist is almost always a mistyped path. The steps that cannot do without
 * their file still skip and still succeed (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md,
 * run them all, then fail if any failed), and the steps that pull everything when their file is not
 * there do so: the one warning names both. They just do not repeat the warning.
 * A folder that exists but lacks a file keeps one warning per missing file for the steps that skip.
 * Only an export reads files from the config folder, so only an export calls this.
 * @param {AllStep[]} steps the steps of the deployment
 * @param {ConfigManagerAllOptions} options what the command was given
 * @returns {ConfigManagerAllOptions} the options for the steps
 */
function withConfigFolderCheck(
  steps: AllStep[],
  options: ConfigManagerAllOptions
): ConfigManagerAllOptions {
  const problem = configFolderProblem(options.configFolder);
  if (!problem) return options;
  const reading = steps
    .flatMap(({ name, export: stepRun }) =>
      stepRun ? [{ name, file: configFileOf(stepRun) }] : []
    )
    .filter(({ file }) => file && !file.optional);
  const namesOf = (everything: boolean): string[] =>
    reading
      .filter(({ file }) => Boolean(file.absentMeansAll) === everything)
      .map(({ name }) => name)
      .sort();
  const skipped = namesOf(false);
  const inFull = namesOf(true);
  const said = [
    ...(skipped.length > 0
      ? [
          `the steps that need a file from it are skipped (${skipped.join(', ')})`,
        ]
      : []),
    ...(inFull.length > 0
      ? [
          `the steps that can pull everything without a file do so (${inFull.join(', ')})`,
        ]
      : []),
  ];
  if (said.length > 0) {
    printMessage(
      `The config folder '${options.configFolder}' ${
        problem === 'missing' ? 'does not exist' : 'is not a folder'
      }, so ${said.join(' and ')}.`,
      'warn'
    );
  }
  return { ...options, configFolderUnusable: true };
}

/**
 * Decide the layout of the tree before any step writes into it, for the steps
 * that need it (the `apps` step). A marker that cannot be read is left
 * for the step to report.
 */
function withApplicationLayout(
  steps: AllStep[],
  options: ConfigManagerAllOptions
): ConfigManagerAllOptions {
  if (!steps.some((s) => s.name === 'apps')) return options;
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
      'export',
      true
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

/**
 * Pushes the static configuration of the tree in the working directory to the tenant: the `import` of every step of
 * `deploymentMapAllStatic` for the connected deployment type, in the order of the table. Before the first write it
 * checks the tree (see {@link stepsToPush}): a working directory that is not a folder, or a tree that holds none of the
 * folders of the steps, ends the push with one error and nothing written; a step whose folder is not in the tree is
 * skipped with a warning. Every step that runs is run even after one failed, one summary names the failed ones
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md,
 * run them all, then fail if any failed), and `allowFailures` keeps the result true.
 * @param {ConfigManagerAllOptions} options what the command was given: the realm to push (every realm folder of the
 * tree without one), the metadata of the tenant to write and `allowFailures`
 * @returns {Promise<boolean>} true if the push succeeded: no step failed, or `allowFailures` was given
 */
export async function configManagerImportAllStatic(
  options: ConfigManagerAllOptions = {}
): Promise<boolean> {
  try {
    const steps = deploymentMapAllStatic[state.getDeploymentType()];
    // a deployment without the step has nowhere to write what was given: say so instead of dropping it unseen
    if (
      metadataWasGiven(options) &&
      !steps.some((s) => s.name === 'config-metadata')
    ) {
      printMessage(
        `The metadata that was given (-M, --metadata) is not written: a ${state.getDeploymentType()} deployment has no step that writes it.`,
        'warn'
      );
    }
    return await runSteps(steps, options, 'import', true);
  } catch (error) {
    printError(error, 'Error importing all-static in fr-config-manager format');
    return false;
  }
}
