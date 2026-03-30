import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { RetryStrategy } from '@rockcarver/frodo-lib/types/api/BaseApi.js';
import { AddHelpTextContext, Argument, Command, Help, Option } from 'commander';
import fs from 'fs';

import {
  cleanupProgressIndicators,
  createProgressIndicator,
  curlirizeMessage,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
  verboseMessage,
} from '../utils/Console.js';

// Frodo constants
const constants = frodo.utils.constants;
const {
  DEFAULT_REALM_KEY,
  DEPLOYMENT_TYPES,
  RETRY_STRATEGIES,
  RETRY_NOTHING_KEY,
} = constants;
const { convertPrivateKeyToPem } = frodo.utils.crypto;

// Default heading for grouped subcommands.
const COMMANDS_HEADING = 'Commands:';
// Heading for command-specific options that do not declare a group.
const COMMAND_OPTIONS_HEADING = 'Options:';
// Group for connection and deployment endpoint settings.
const CONNECTION_OPTIONS_HEADING = 'Connection Options:';
// Group for login and credential-related settings.
const AUTHENTICATION_OPTIONS_HEADING = 'Authentication Options:';
// Group for runtime behavior controls.
const RUNTIME_OPTIONS_HEADING = 'Runtime Options:';
// Group for output and diagnostics controls.
const OUTPUT_OPTIONS_HEADING = 'Output Options:';
// Help flags intentionally use the same visible label as command options to keep a single
// "Options:" section in help output while still preserving a separate semantic bucket.
const HELP_OPTIONS_HEADING = 'Options:';
// Top-level env var section for host/realm/endpoint values.
const CONNECTION_ENVIRONMENT_VARIABLES_HEADING = 'Connection:';
// Top-level env var section for auth and credentials.
const AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING = 'Authentication:';
// Top-level env var section for runtime behavior.
const RUNTIME_ENVIRONMENT_VARIABLES_HEADING = 'Runtime:';
// Top-level env var section for output and debug toggles.
const OUTPUT_ENVIRONMENT_VARIABLES_HEADING = 'Output:';
// Short flag alias for --help-more; triggers level-2 help showing all option groups.
const HELP_MORE_SHORT_FLAG = '-hh';
// Level-2 help flag: shows all option groups (Connection, Authentication, Runtime, Output)
// that are hidden from basic -h output, including stability badges. Does not include env vars.
const HELP_MORE_FLAG = '--help-more';
// Short flag alias for --help-all; triggers level-3 help showing everything.
const HELP_ALL_SHORT_FLAG = '-hhh';
// Level-3 help flag: shows all option groups plus environment variable sections.
// Superset of --help-more output. Stability badges appear at all levels.
const HELP_ALL_FLAG = '--help-all';
// Fallback help text width used when the terminal width cannot be determined.
const DEFAULT_HELP_WIDTH = 100;
// Absolute minimum help text width; applied at all help levels regardless of terminal width.
const MINIMUM_HELP_WIDTH = 60;
// Padding between option flags and their descriptions in help output.
const ENVIRONMENT_VARIABLE_NAME_INDENT = 4;
// Padding between environment variable descriptions and their group headings in help output.
const ENVIRONMENT_VARIABLE_DESCRIPTION_PADDING = 2;
// Property key used to attach stability metadata to Commander objects (commands, options,
// arguments). The double-underscore prefix avoids collision with Commander's own property
// namespace. Typed `as const` so TypeScript treats it as a literal type for type-safe
// indexed access via the `StabilityAnnotated` interface.
const STABILITY_METADATA_KEY = '__frodoStabilityMetadata' as const;

export type StabilityIndicator =
  | 'stable'
  | 'preview'
  | 'experimental'
  | 'deprecated';

export type StabilityGateMode = 'option-or-env' | 'option-only' | 'env-only';

export type StabilityGateConfig = {
  requiredOptIn?: boolean;
  optionName?: string;
  envVarName?: string;
  helpText?: string;
  mode?: StabilityGateMode;
};

type StabilityMetadata = {
  level: StabilityIndicator;
  gate?: StabilityGateConfig;
};

const stabilityLevelPriority: Record<StabilityIndicator, number> = {
  stable: 0,
  preview: 1,
  experimental: 2,
  deprecated: 3,
};

type StabilityAnnotated = {
  [STABILITY_METADATA_KEY]?: StabilityMetadata;
};

/**
 * Logical scope used for deployment-constrained help sub-sections.
 *
 * Keep this in sync with deployment type constants and with
 * `getScopeForDeploymentType()` / `getDeploymentTypeForScope()`.
 */
type DeploymentScope = 'classic-only' | 'cloud-only' | 'forgeops-only';

/**
 * Optional per-command variants for a single environment variable.
 *
 * Use this when a variable has different override rules depending on the
 * command (for example `frodo conn save` versus `frodo log`).
 */
type VariantDescriptor = {
  description: string;
  appliesTo?: string;
  commandNames?: string[];
  include?: (command: FrodoCommand) => boolean;
};

/**
 * Metadata for environment variable help generation.
 *
 * How to add a new env var entry:
 * 1) Add an object to `environmentVariables` with `name`, `description`, and `group`.
 * 2) Add `include` when the variable should only appear if a default arg/option exists.
 * 3) Add `appliesToTypes` and/or `scope` when deployment visibility is constrained.
 * 4) Add `variants` when the override description differs by command.
 */
type EnvironmentVariableDescriptor = {
  name: string;
  description: string;
  group: string;
  appliesToTypes?: string[];
  scope?: DeploymentScope;
  commandNames?: string[];
  include?: (command: FrodoCommand) => boolean;
  variants?: VariantDescriptor[];
};

/**
 * Order of top-level environment variable groups.
 *
 * Add new headings here if you introduce new env var categories and want
 * deterministic output ordering in full help (`-hhh`).
 */
const environmentVariableGroupOrder = [
  CONNECTION_ENVIRONMENT_VARIABLES_HEADING,
  AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
  RUNTIME_ENVIRONMENT_VARIABLES_HEADING,
  OUTPUT_ENVIRONMENT_VARIABLES_HEADING,
];

/**
 * Rendering order for scoped deployment sub-sections.
 *
 * This controls the order of inline labels such as `(Classic-only):`
 * in options, env vars, and command lists.
 */
const environmentVariableScopeOrder: DeploymentScope[] = [
  'classic-only',
  'cloud-only',
  'forgeops-only',
];

function withHelpGroup(option: Option, group: string): Option {
  option.helpGroup(group);
  return option;
}

/**
 * Annotates an option with stability metadata for help rendering.
 * @param option Option to annotate.
 * @param level Stability level to apply.
 * @returns Same option for chaining.
 */
export function withOptionStability(
  option: Option,
  level: StabilityIndicator,
  gate?: StabilityGateConfig
): Option {
  const metadata = getStabilityMetadata(option);
  setStabilityMetadata(option, {
    ...metadata,
    level,
    gate: gate || metadata.gate,
  });
  return option;
}

/**
 * Annotates an argument with stability metadata for help rendering.
 * @param argument Argument to annotate.
 * @param level Stability level to apply.
 * @returns Same argument for chaining.
 */
export function withArgumentStability(
  argument: Argument,
  level: StabilityIndicator,
  gate?: StabilityGateConfig
): Argument {
  const metadata = getStabilityMetadata(argument);
  setStabilityMetadata(argument, {
    ...metadata,
    level,
    gate: gate || metadata.gate,
  });
  return argument;
}

/**
 * Stores stability metadata on Commander objects.
 * @param target Annotated command, option, or argument.
 * @param metadata Stability metadata to persist.
 */
function setStabilityMetadata(
  target: Command | Option | Argument,
  metadata: StabilityMetadata
) {
  (target as unknown as StabilityAnnotated)[STABILITY_METADATA_KEY] = metadata;
}

/**
 * Reads raw stability metadata as explicitly configured on the target.
 * @param target Annotated command, option, or argument.
 * @returns Explicit metadata if present, otherwise undefined.
 */
function getRawStabilityMetadata(
  target: Command | Option | Argument
): StabilityMetadata | undefined {
  return (target as unknown as StabilityAnnotated)[STABILITY_METADATA_KEY];
}

/**
 * Reads stability metadata from Commander objects.
 * @param target Annotated command, option, or argument.
 * @returns Stability metadata, defaulting to stable.
 */
function getStabilityMetadata(
  target: Command | Option | Argument
): StabilityMetadata {
  const metadata = getRawStabilityMetadata(target);
  return metadata || { level: 'stable' };
}

/**
 * Resolves effective stability for a command by walking up parent commands.
 *
 * Behavior:
 * - level: strongest level found in the command ancestry
 * - gate: nearest required opt-in gate found in the ancestry
 *
 * This allows declaring stability once at a stub command (command tree root)
 * and having it apply to all descendants.
 * @param command Command to evaluate.
 * @returns Effective stability metadata for runtime and help rendering.
 */
function getEffectiveCommandStabilityMetadata(
  command: Command
): StabilityMetadata {
  let level: StabilityIndicator = 'stable';
  let gate: StabilityGateConfig | undefined;

  let current: Command | null = command;
  while (current) {
    const metadata = getRawStabilityMetadata(current);
    if (metadata) {
      if (
        stabilityLevelPriority[metadata.level] > stabilityLevelPriority[level]
      ) {
        level = metadata.level;
      }

      if (!gate && metadata.gate?.requiredOptIn) {
        gate = metadata.gate;
      }
    }
    current = current.parent || null;
  }

  return gate ? { level, gate } : { level };
}

/**
 * Formats stability level labels for display in help text and warnings.
 * @param level Stability level.
 * @returns Human-readable label.
 */
function formatStabilityLevel(level: StabilityIndicator): string {
  switch (level) {
    case 'preview':
      return 'Preview';
    case 'experimental':
      return 'Experimental';
    case 'deprecated':
      return 'Deprecated';
    default:
      return 'Stable';
  }
}

/**
 * Determines whether colored stability badges should be emitted.
 * @returns True when color output is supported and not explicitly disabled.
 */
function shouldUseStabilityColors(): boolean {
  return !!process.stdout.isTTY && !process.env.NO_COLOR;
}

/**
 * Applies ANSI color to stability and opt-in badges.
 * @param text Badge text to colorize.
 * @param level Stability level used for color selection.
 * @param isOptInBadge True for opt-in badge coloring.
 * @returns Colored or plain badge text.
 */
function colorizeStabilityBadge(
  text: string,
  level: StabilityIndicator,
  isOptInBadge = false
): string {
  if (!shouldUseStabilityColors()) {
    return text;
  }

  const reset = '\x1b[0m';
  if (isOptInBadge) {
    return `\x1b[36m${text}${reset}`;
  }

  switch (level) {
    case 'preview':
      return `\x1b[1;93m${text}${reset}`;
    case 'experimental':
      return `\x1b[1;31m${text}${reset}`;
    case 'deprecated':
      return `\x1b[1;90m${text}${reset}`;
    default:
      return `\x1b[32m${text}${reset}`;
  }
}

/**
 * Appends stability and optional opt-in badges to a description.
 * @param description Existing description text.
 * @param target Annotated command, option, or argument.
 * @returns Decorated description.
 */
function decorateDescriptionWithStability(
  description: string,
  target: Command | Option | Argument
): string {
  const metadata =
    target instanceof Command
      ? getEffectiveCommandStabilityMetadata(target)
      : getStabilityMetadata(target);
  if (metadata.level === 'stable') {
    return description;
  }

  const badges = [
    colorizeStabilityBadge(
      `[${formatStabilityLevel(metadata.level)}]`,
      metadata.level
    ),
  ];
  if (metadata.gate?.requiredOptIn) {
    badges.push(
      colorizeStabilityBadge('[Opt-in required]', metadata.level, true)
    );
  }

  return description ? `${badges.join(' ')} ${description}` : badges.join(' ');
}

/**
 * Creates a detached copy of an option so command-level mutations do not
 * affect shared defaults.
 * @param option Source option definition.
 * @returns Cloned option instance.
 */
function cloneOption(option: Option): Option {
  const cloned = Object.assign(new Option(option.flags, option.description), {
    defaultValue: option.defaultValue,
    defaultValueDescription: option.defaultValueDescription,
    presetArg: option.presetArg,
    envVar: option.envVar,
    parseArg: option.parseArg,
    hidden: option.hidden,
    mandatory: option.mandatory,
    argChoices: option.argChoices ? [...option.argChoices] : option.argChoices,
    helpGroupHeading: option.helpGroupHeading,
  });

  setStabilityMetadata(cloned, getStabilityMetadata(option));
  return cloned;
}

/**
 * Creates a detached copy of an argument so command-level mutations do not
 * affect shared defaults.
 * @param argument Source argument definition.
 * @returns Cloned argument instance.
 */
function cloneArgument(argument: Argument): Argument {
  const bracketOpen = argument.required ? '<' : '[';
  const bracketClose = argument.required ? '>' : ']';
  const spec = `${bracketOpen}${argument.name()}${argument.variadic ? '...' : ''}${bracketClose}`;

  const cloned = Object.assign(new Argument(spec, argument.description), {
    defaultValue: argument.defaultValue,
    defaultValueDescription: argument.defaultValueDescription,
    parseArg: argument.parseArg,
    argChoices: argument.argChoices
      ? [...argument.argChoices]
      : argument.argChoices,
  });

  setStabilityMetadata(cloned, getStabilityMetadata(argument));
  return cloned;
}

export const hostArgument = new Argument(
  '[host]',
  'AM base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just specify a unique substring or alias.'
);

const realmArgument = new Argument(
  '[realm]',
  "Realm. Specify realm as '/' for the root realm or 'realm' or '/parent/child' otherwise."
).default(
  // must check for FRODO_REALM env variable here because otherwise cli will overwrite realm with default value
  process.env.FRODO_REALM || DEFAULT_REALM_KEY,
  '"alpha" for Identity Cloud tenants, "/" otherwise.'
);

const usernameArgument = new Argument(
  '[username]',
  'Username to login with. Must be an admin user with appropriate rights to manage authentication journeys/trees.'
);

const passwordArgument = new Argument('[password]', 'Password.');

const idmHostOption = withHelpGroup(
  new Option(
    '--idm-host <idm-host>',
    'IDM base URL, e.g.: https://cdk.idm.example.com/myidm. Use only if your IDM installation resides in a different domain and/or if the base path differs from the default "/openidm".'
  ),
  CONNECTION_OPTIONS_HEADING
);

const loginClientId = withHelpGroup(
  new Option(
    '--login-client-id <client-id>',
    'Specify a custom OAuth2 client id to use a your own oauth2 client for IDM API calls in deployments of type "cloud" or "forgeops". Your custom client must be configured as a public client and allow the authorization code grant using the "openid fr:idm:*" scope. Use the "--redirect-uri" parameter if you have configured a custom redirect uri (default: "<host>/platform/appAuthHelperRedirect.html").'
  ),
  AUTHENTICATION_OPTIONS_HEADING
);

const loginRedirectUri = withHelpGroup(
  new Option(
    '--login-redirect-uri <redirect-uri>',
    'Specify a custom redirect URI to use with your custom OAuth2 client (efault: "<host>/platform/appAuthHelperRedirect.html").'
  ),
  AUTHENTICATION_OPTIONS_HEADING
);

const serviceAccountIdOption = withHelpGroup(
  new Option('--sa-id <sa-id>', 'Service account id.'),
  AUTHENTICATION_OPTIONS_HEADING
);

const serviceAccountJwkFileOption = withHelpGroup(
  new Option(
    '--sa-jwk-file <file>',
    'File containing the JSON Web Key (JWK) associated with the the service account.'
  ),
  AUTHENTICATION_OPTIONS_HEADING
);

const amsterPrivateKeyPassphraseOption = withHelpGroup(
  new Option(
    '--passphrase <passphrase>',
    'The passphrase for the Amster private key if it is encrypted.'
  ),
  AUTHENTICATION_OPTIONS_HEADING
);

const amsterPrivateKeyFileOption = withHelpGroup(
  new Option(
    '--private-key <file>',
    'File containing the private key for authenticating with Amster. Supported formats include PEM (both PKCS#1 and PKCS#8 variants), OpenSSH, DNSSEC, and JWK.'
  ),
  AUTHENTICATION_OPTIONS_HEADING
);

const deploymentOption = withHelpGroup(
  new Option(
    '-m, --type <type>',
    'Override auto-detected deployment type. Valid values for type: \n\
classic:  A classic Access Management-only deployment with custom layout and configuration. \n\
cloud:    A ForgeRock Identity Cloud environment. \n\
forgeops: A ForgeOps CDK or CDM deployment. \n\
The detected or provided deployment type controls certain behavior like obtaining an Identity \
Management admin token or not and whether to export/import referenced email templates or how \
to walk through the tenant admin login flow of Identity Cloud and handle MFA'
  ).choices(DEPLOYMENT_TYPES),
  CONNECTION_OPTIONS_HEADING
);

const directoryOption = withHelpGroup(
  new Option(
    '-D, --directory <directory>',
    'Set the working directory.'
  ).default(undefined, 'undefined'),
  RUNTIME_OPTIONS_HEADING
);

const insecureOption = withHelpGroup(
  new Option(
    '-k, --insecure',
    'Allow insecure connections when using SSL/TLS, including expired certificates.'
  ).default(false, "Don't allow insecure connections"),
  CONNECTION_OPTIONS_HEADING
);

const verboseOption = withHelpGroup(
  new Option(
    '--verbose',
    'Verbose output during command execution. If specified, may or may not produce additional output.'
  ),
  OUTPUT_OPTIONS_HEADING
);

const debugOption = withHelpGroup(
  new Option(
    '--debug',
    'Debug output during command execution. If specified, may or may not produce additional output helpful for troubleshooting.'
  ),
  OUTPUT_OPTIONS_HEADING
);

const curlirizeOption = withHelpGroup(
  new Option('--curlirize', 'Output all network calls in curl format.'),
  OUTPUT_OPTIONS_HEADING
);

const noCacheOption = withHelpGroup(
  new Option('--no-cache', 'Disable token cache for this operation.'),
  RUNTIME_OPTIONS_HEADING
);

const useRealmPrefixOnManagedObjects = withHelpGroup(
  new Option(
    '--use-realm-prefix-on-managed-objects',
    'Set to true if you want to use the realm name as a prefix on managed object configuration, e.g. managed/alpha_user,\
  managed/alpha_application or managed/bravo_organization. When false, the default behaviour of using managed/user \
  etc. is retained. \
  This option is ignored when the deployment type is "cloud".'
  ),
  CONNECTION_OPTIONS_HEADING
);

const flushCacheOption = withHelpGroup(
  new Option('--flush-cache', 'Flush token cache.'),
  RUNTIME_OPTIONS_HEADING
);

const retryOption = withHelpGroup(
  new Option(
    '--retry <strategy>',
    `Retry failed operations. Valid values for strategy: \n\
everything: Retry all failed operations. \n\
network:    Retry only network-related failed operations. \n\
nothing:    Do not retry failed operations. \n\
The selected retry strategy controls how the CLI handles failures.`
  )
    .choices(RETRY_STRATEGIES)
    .default(`${RETRY_NOTHING_KEY}`, `Do not retry failed operations.`),
  RUNTIME_OPTIONS_HEADING
);

/**
 * Default positional arguments added to every `FrodoCommand` unless omitted.
 *
 * To add a new global/default argument:
 * 1) Define it near other `Argument` declarations.
 * 2) Add it to this array.
 * 3) Add state behavior in `stateMap` if needed.
 * 4) Add env var metadata in `environmentVariables` if there is an override.
 */
const defaultArgs = [
  hostArgument,
  realmArgument,
  usernameArgument,
  passwordArgument,
];

/**
 * Default options added to every `FrodoCommand` unless explicitly omitted.
 *
 * To add a new global/default option:
 * 1) Define the `Option` above and assign a help group via `withHelpGroup(...)`.
 * 2) Add it to this array.
 * 3) Add its behavior to `stateMap` if it should update shared runtime state.
 * 4) Add corresponding env var metadata in `environmentVariables` if applicable.
 * 5) If deployment-specific, add mapping in `getOptionAppliesToTypes(...)`.
 */
const defaultOpts = [
  idmHostOption,
  loginClientId,
  loginRedirectUri,
  serviceAccountIdOption,
  serviceAccountJwkFileOption,
  amsterPrivateKeyPassphraseOption,
  amsterPrivateKeyFileOption,
  deploymentOption,
  directoryOption,
  insecureOption,
  verboseOption,
  debugOption,
  curlirizeOption,
  noCacheOption,
  flushCacheOption,
  retryOption,
  useRealmPrefixOnManagedObjects,
];

/**
 * Maps default argument/option names to state mutators.
 *
 * This is the central place to wire runtime side effects for default CLI
 * arguments and options. When introducing a new default argument/option,
 * add an entry here if it needs to mutate shared state.
 */
const stateMap = {
  [hostArgument.name()]: (host: string) => state.setHost(host),
  [realmArgument.name()]: (realm: string) => state.setRealm(realm),
  [usernameArgument.name()]: (username: string) => state.setUsername(username),
  [passwordArgument.name()]: (password: string) => state.setPassword(password),
  [idmHostOption.attributeName()]: (idmHost: string) =>
    state.setIdmHost(idmHost),
  [loginClientId.attributeName()]: (clientId: string) =>
    state.setAdminClientId(clientId),
  [loginRedirectUri.attributeName()]: (redirectUri: string) =>
    state.setAdminClientRedirectUri(redirectUri),
  [serviceAccountIdOption.attributeName()]: (saId: string) =>
    state.setServiceAccountId(saId),
  [serviceAccountJwkFileOption.attributeName()]: (file: string) => {
    try {
      const data = fs.readFileSync(file);
      const jwk = JSON.parse(data.toString());
      state.setServiceAccountJwk(jwk);
    } catch (error) {
      printMessage(
        `Error parsing JWK from file ${file}: ${error.message}`,
        'error'
      );
    }
  },
  [amsterPrivateKeyPassphraseOption.attributeName()]: (passphrase: string) => {
    // This is needed in the case the passphrase is an option, but the private key is an environment variable.
    process.env.FRODO_AMSTER_PASSPHRASE = passphrase;
  },
  [amsterPrivateKeyFileOption.attributeName()]: (
    file: string,
    options: Record<string, string | boolean>
  ) => {
    const passphrase =
      (options[amsterPrivateKeyPassphraseOption.attributeName()] as string) ||
      process.env.FRODO_AMSTER_PASSPHRASE;
    try {
      // Store as PEM format (PKCS#8 variant specifically) since Jose supports PEM and since PKCS#8 supports more algorithms than PKCS#1
      state.setAmsterPrivateKey(
        convertPrivateKeyToPem(
          fs.readFileSync(file, 'utf8'),
          passphrase,
          file
            .replaceAll('\\', '/')
            .substring(file.replaceAll('\\', '/').lastIndexOf('/') + 1)
        )
      );
    } catch (error) {
      printMessage(
        `Error parsing private key from file ${file}: ${error.message}`,
        'error'
      );
    }
  },
  [deploymentOption.attributeName()]: (type: string) =>
    state.setDeploymentType(type),
  [directoryOption.attributeName()]: (directory: string) =>
    state.setDirectory(directory.replaceAll('\\', '/').replaceAll('C:', '')),
  [insecureOption.attributeName()]: (insecure: boolean) =>
    state.setAllowInsecureConnection(insecure),
  [verboseOption.attributeName()]: (verbose: boolean) =>
    state.setVerbose(verbose),
  [debugOption.attributeName()]: (debug: boolean) => state.setDebug(debug),
  [curlirizeOption.attributeName()]: (curlirize: boolean) =>
    state.setCurlirize(curlirize),
  [noCacheOption.attributeName()]: (cache: boolean) =>
    state.setUseTokenCache(cache),
  [useRealmPrefixOnManagedObjects.attributeName()]: () =>
    state.setUseRealmPrefixOnManagedObjects(true),
  [flushCacheOption.attributeName()]: (flush: boolean) => {
    if (flush) frodo.cache.flush();
  },
  [retryOption.attributeName()]: (strategy: RetryStrategy) => {
    state.setAxiosRetryStrategy(strategy);
  },
};

/**
 * Registry of environment variables shown in `-hhh` help.
 *
 * This list drives display only; runtime behavior is still controlled by
 * command handlers and `stateMap`. Keep descriptions in sync with the
 * corresponding option/argument override semantics.
 */
const environmentVariables: EnvironmentVariableDescriptor[] = [
  {
    name: 'FRODO_HOST',
    description: "AM base URL. Overridden by 'host' argument.",
    group: CONNECTION_ENVIRONMENT_VARIABLES_HEADING,
    include: (command) => command.hasDefaultArgument('host'),
  },
  {
    name: 'FRODO_IDM_HOST',
    description: "IDM base URL. Overridden by '--idm-host' option.",
    group: CONNECTION_ENVIRONMENT_VARIABLES_HEADING,
    include: (command) =>
      command.hasDefaultOption(idmHostOption.attributeName()),
  },
  {
    name: 'FRODO_REALM',
    description: "Realm. Overridden by 'realm' argument.",
    group: CONNECTION_ENVIRONMENT_VARIABLES_HEADING,
    include: (command) => command.hasDefaultArgument('realm'),
  },
  {
    name: 'FRODO_USERNAME',
    description: "Username. Overridden by 'username' argument.",
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
    include: (command) => command.hasDefaultArgument('username'),
  },
  {
    name: 'FRODO_PASSWORD',
    description: "Password. Overridden by 'password' argument.",
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
    include: (command) => command.hasDefaultArgument('password'),
  },
  {
    name: 'FRODO_LOGIN_CLIENT_ID',
    description:
      "OAuth2 client id for IDM API calls. Overridden by '--login-client-id' option.",
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
    appliesToTypes: [
      constants.CLOUD_DEPLOYMENT_TYPE_KEY,
      constants.FORGEOPS_DEPLOYMENT_TYPE_KEY,
    ],
    include: (command) =>
      command.hasDefaultOption(loginClientId.attributeName()),
  },
  {
    name: 'FRODO_LOGIN_REDIRECT_URI',
    description:
      "Redirect Uri for custom OAuth2 client id. Overridden by '--login-redirect-uri' option.",
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
    appliesToTypes: [
      constants.CLOUD_DEPLOYMENT_TYPE_KEY,
      constants.FORGEOPS_DEPLOYMENT_TYPE_KEY,
    ],
    include: (command) =>
      command.hasDefaultOption(loginRedirectUri.attributeName()),
  },
  {
    name: 'FRODO_SA_ID',
    description: "Service account uuid. Overridden by '--sa-id' option.",
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
    scope: 'cloud-only',
    include: (command) =>
      command.hasDefaultOption(serviceAccountIdOption.attributeName()),
  },
  {
    name: 'FRODO_SA_JWK',
    description:
      "Service account JWK. Overridden by '--sa-jwk-file' option but takes the actual JWK as a value, not a file name.",
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
    scope: 'cloud-only',
    include: (command) =>
      command.hasDefaultOption(serviceAccountJwkFileOption.attributeName()),
  },
  {
    name: 'FRODO_AMSTER_PASSPHRASE',
    description:
      "Passphrase for the Amster private key if it is encrypted. Overridden by '--passphrase' option.",
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
    scope: 'classic-only',
    include: (command) =>
      command.hasDefaultOption(
        amsterPrivateKeyPassphraseOption.attributeName()
      ),
  },
  {
    name: 'FRODO_AMSTER_PRIVATE_KEY',
    description:
      "Amster private key. Overridden by '--private-key' option but takes the actual private key as a value (i.e. the file contents), not a file name. Supported formats include PEM (both PKCS#1 and PKCS#8 variants), OpenSSH, DNSSEC, and JWK.",
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
    scope: 'classic-only',
    include: (command) =>
      command.hasDefaultOption(amsterPrivateKeyFileOption.attributeName()),
  },
  {
    name: 'FRODO_NO_CACHE',
    description: "Disable token cache. Same as '--no-cache' option.",
    group: RUNTIME_ENVIRONMENT_VARIABLES_HEADING,
    include: (command) =>
      command.hasDefaultOption(noCacheOption.attributeName()),
  },
  {
    name: 'FRODO_TOKEN_CACHE_PATH',
    description:
      "Use this token cache file instead of '~/.frodo/TokenCache.json'.",
    group: RUNTIME_ENVIRONMENT_VARIABLES_HEADING,
  },
  {
    name: 'FRODO_CONNECTION_PROFILES_PATH',
    description:
      "Use this connection profiles file instead of '~/.frodo/Connections.json'.",
    group: RUNTIME_ENVIRONMENT_VARIABLES_HEADING,
  },
  {
    name: 'FRODO_AUTHENTICATION_SERVICE',
    description:
      "Name of a login journey to use. When using an Amster private key, specifies which journey to use for Amster authentication as opposed to the default 'amsterService' journey.",
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
  },
  {
    name: 'FRODO_AUTHENTICATION_HEADER_OVERRIDES',
    description:
      'Map of headers: \'{"host":"am.example.com:8081"}\'. These headers are sent with all requests and can be used to override default behavior, for example to set a custom host header for Proxy Connect-protected PingOne Advanced Identity Cloud environments.',
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
  },
  {
    name: 'FRODO_CONFIGURATION_HEADER_OVERRIDES',
    description:
      'Map of headers: \'{"X-Configuration-Type":"mutable"}\'. These headers are sent with all configuration requests and can be used to override default behavior, for example to set a custom configuration header for mutable PingOne Advanced Identity Cloud environments.',
    group: RUNTIME_ENVIRONMENT_VARIABLES_HEADING,
  },
  {
    name: 'FRODO_DEBUG',
    description: "Set to any value to enable debug output. Same as '--debug'.",
    group: OUTPUT_ENVIRONMENT_VARIABLES_HEADING,
    include: (command) => command.hasDefaultOption(debugOption.attributeName()),
  },
  {
    name: 'FRODO_IGA',
    description:
      'Set to "true" to enable IGA (Identity Governance) endpoints for cloud deployments, or "false" to disable them, overriding auto-detected value.',
    group: RUNTIME_ENVIRONMENT_VARIABLES_HEADING,
    scope: 'cloud-only' as DeploymentScope,
  },
  {
    name: 'FRODO_MASTER_KEY_PATH',
    description:
      "Use this master key file instead of '~/.frodo/masterkey.key' file.",
    group: RUNTIME_ENVIRONMENT_VARIABLES_HEADING,
  },
  {
    name: 'FRODO_MASTER_KEY',
    description:
      "Use this master key instead of what's in '~/.frodo/masterkey.key'. Takes precedence over FRODO_MASTER_KEY_PATH.",
    group: RUNTIME_ENVIRONMENT_VARIABLES_HEADING,
  },
  {
    name: 'FRODO_LOG_KEY',
    description: 'Log API key.',
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
    scope: 'cloud-only',
    variants: [
      {
        description: "Overridden by '--log-api-key' option.",
        appliesTo: '`frodo conn save`',
        commandNames: ['frodo conn save'],
      },
      {
        description: "Overridden by 'username' argument.",
        appliesTo: '`frodo log` commands',
        include: (command) => command.name().startsWith('frodo log'),
      },
    ],
  },
  {
    name: 'FRODO_LOG_SECRET',
    description: 'Log API secret.',
    group: AUTHENTICATION_ENVIRONMENT_VARIABLES_HEADING,
    scope: 'cloud-only',
    variants: [
      {
        description: "Overridden by '--log-api-secret' option.",
        appliesTo: '`frodo conn save`',
        commandNames: ['frodo conn save'],
      },
      {
        description: "Overridden by 'password' argument.",
        appliesTo: '`frodo log` commands',
        include: (command) => command.name().startsWith('frodo log'),
      },
    ],
  },
];

const longestEnvironmentVariableNameLength = Math.max(
  ...environmentVariables.map(({ name }) => name.length)
);
const environmentVariableDescriptionColumn =
  ENVIRONMENT_VARIABLE_NAME_INDENT +
  longestEnvironmentVariableNameLength +
  ENVIRONMENT_VARIABLE_DESCRIPTION_PADDING;

/**
 * Checks whether a variant line applies to the current command.
 * @param variant Variant metadata under an env var descriptor.
 * @param command Command being rendered.
 * @returns True when variant should be included.
 */
function matchesEnvironmentVariableVariant(
  variant: VariantDescriptor,
  command: FrodoCommand
) {
  if (variant.commandNames && !variant.commandNames.includes(command.name())) {
    return false;
  }

  if (variant.include) {
    return variant.include(command);
  }

  return true;
}

/**
 * Checks whether an environment variable descriptor applies to the current
 * command.
 * @param entry Environment variable descriptor.
 * @param command Command being rendered.
 * @returns True when descriptor should be included.
 */
function matchesEnvironmentVariableEntry(
  entry: EnvironmentVariableDescriptor,
  command: FrodoCommand
) {
  if (entry.commandNames && !entry.commandNames.includes(command.name())) {
    return false;
  }

  if (entry.include) {
    return entry.include(command);
  }

  return true;
}

/**
 * Computes effective wrapping width for help output.
 * @returns Terminal-aware text width with sane minimum fallback.
 */
function getHelpTextWidth() {
  const envWidth = Number.parseInt(process.env.COLUMNS || '', 10);
  const terminalWidth = Number.isNaN(envWidth)
    ? process.stdout.columns
    : envWidth;

  return Math.max(terminalWidth || DEFAULT_HELP_WIDTH, MINIMUM_HELP_WIDTH);
}

/**
 * Wraps a help description preserving hanging indentation.
 * @param prefix Prefix for first line and width anchor for continuation lines.
 * @param text Description text to wrap.
 * @returns Wrapped lines ready to join with newlines.
 */
function wrapHelpText(prefix: string, text: string) {
  if (!text) {
    return [prefix.trimEnd()];
  }

  const continuationPrefix = ' '.repeat(prefix.length);
  const availableWidth = Math.max(20, getHelpTextWidth() - prefix.length);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (currentLine && candidate.length > availableWidth) {
      lines.push(currentLine);
      currentLine = word;
      continue;
    }

    currentLine = candidate;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.map(
    (line, index) => `${index === 0 ? prefix : continuationPrefix}${line}`
  );
}

/**
 * Builds aligned prefix for environment variable name column.
 * @param name Environment variable name.
 * @param extraIndent Additional left indentation.
 * @returns Formatted prefix including spacing before description column.
 */
function formatEnvironmentVariablePrefix(name: string, extraIndent = 0) {
  const nameIndent = ENVIRONMENT_VARIABLE_NAME_INDENT + extraIndent;
  const trailingPadding = Math.max(
    1,
    environmentVariableDescriptionColumn - nameIndent - name.length
  );

  return `${' '.repeat(nameIndent)}${name}${' '.repeat(trailingPadding)}`;
}

/**
 * Builds prefix for env var variant bullet lines.
 * @param extraIndent Additional left indentation.
 * @returns Prefix aligned with env var description column.
 */
function formatEnvironmentVariableVariantPrefix(extraIndent = 0) {
  return `${' '.repeat(formatEnvironmentVariablePrefix('', extraIndent).length)}- `;
}

/**
 * Formats one env var entry and optional variant lines into wrapped output.
 * @param entry Env var descriptor.
 * @param variants Variant rows to render.
 * @param extraIndent Additional left indentation.
 * @returns Rendered text lines.
 */
function formatEnvironmentVariableEntry(
  entry: EnvironmentVariableDescriptor,
  variants: VariantDescriptor[],
  extraIndent = 0
) {
  if (!variants.length) {
    return wrapHelpText(
      formatEnvironmentVariablePrefix(entry.name, extraIndent),
      entry.description
    );
  }

  const variantLines = variants.map((variant) => {
    const appliesToPrefix = variant.appliesTo ? `(${variant.appliesTo}) ` : '';
    return wrapHelpText(
      formatEnvironmentVariableVariantPrefix(extraIndent),
      `${appliesToPrefix}${variant.description}`
    );
  });

  return [
    ...wrapHelpText(
      formatEnvironmentVariablePrefix(entry.name, extraIndent),
      entry.description
    ),
    ...variantLines.flat(),
  ];
}

type GroupData = {
  unscoped: string[];
  scoped: Map<string, string[]>;
};

type OptionGroupData = {
  unscoped: Option[];
  scoped: Map<DeploymentScope, Option[]>;
};

type CommandGroupData = {
  unscoped: Command[];
  scoped: Map<DeploymentScope, Command[]>;
};
type CommandWithTypes = Command & { types?: string[] };

/**
 * Converts a rendering scope (e.g. `cloud-only`) back to canonical
 * deployment type key (e.g. `cloud`).
 * @param scope Scoped token used by help renderer.
 * @returns Canonical deployment type key.
 */
function getDeploymentTypeForScope(scope: DeploymentScope): string {
  switch (scope) {
    case 'classic-only':
      return constants.CLASSIC_DEPLOYMENT_TYPE_KEY;
    case 'cloud-only':
      return constants.CLOUD_DEPLOYMENT_TYPE_KEY;
    case 'forgeops-only':
      return constants.FORGEOPS_DEPLOYMENT_TYPE_KEY;
  }
}

/**
 * Returns whether a scoped env var/section should be rendered for the
 * current command's supported deployment types.
 * @param scope Deployment scope being evaluated.
 * @param supportedTypes Command-supported deployment types.
 * @returns True when scope is compatible.
 */
function isScopeSupported(
  scope: DeploymentScope,
  supportedTypes?: string[]
): boolean {
  if (!supportedTypes || supportedTypes.length === 0) {
    return true;
  }
  return supportedTypes.includes(getDeploymentTypeForScope(scope));
}

/**
 * Returns whether an env var entry is generally compatible with command
 * deployment types based on `appliesToTypes` metadata.
 * @param entry Env var descriptor.
 * @param supportedTypes Command-supported deployment types.
 * @returns True when entry should be considered for rendering.
 */
function isEntrySupportedByTypes(
  entry: EnvironmentVariableDescriptor,
  supportedTypes?: string[]
): boolean {
  if (!supportedTypes || supportedTypes.length === 0) {
    return true;
  }

  if (!entry.appliesToTypes || entry.appliesToTypes.length === 0) {
    return true;
  }

  return entry.appliesToTypes.some((type) => supportedTypes.includes(type));
}

/**
 * Helper used to switch between flat output (single deployment type) and
 * scoped sub-sections (mixed deployment types).
 * @param types Deployment type list.
 * @returns True when exactly one deployment type is supported.
 */
function isSingleDeploymentType(types?: string[]): boolean {
  return !!types && types.length === 1;
}

/**
 * Collects env var lines grouped by top-level section and optional
 * deployment scope.
 *
 * Extension guidance:
 * - Prefer adding metadata to `environmentVariables` instead of custom logic.
 * - Only add conditional code here when metadata cannot express the behavior.
 * @param command Command context for include predicates.
 * @param includeAll When true, bypass command include filters.
 * @param supportedTypes Deployment types for stub/global rendering.
 * @returns Grouped env var lines by top-level group and deployment scope.
 */
function collectEnvironmentVariableGroups(
  command?: FrodoCommand,
  includeAll = false,
  supportedTypes?: string[]
) {
  const groupedEntries = new Map<string, GroupData>();
  const effectiveTypes = command?.types || supportedTypes;

  function getOrCreate(group: string): GroupData {
    let data = groupedEntries.get(group);
    if (!data) {
      data = { unscoped: [], scoped: new Map() };
      groupedEntries.set(group, data);
    }
    return data;
  }

  for (const entry of environmentVariables) {
    if (!isEntrySupportedByTypes(entry, effectiveTypes)) {
      continue;
    }

    if (entry.scope && !isScopeSupported(entry.scope, effectiveTypes)) {
      continue;
    }

    // Scoped entries are rendered as top-level deployment-prefixed groups,
    // so no extra indentation is needed.
    const extraIndent = 0;

    if (entry.variants) {
      const matchingVariants =
        includeAll || !command
          ? entry.variants
          : entry.variants.filter((variant) =>
              matchesEnvironmentVariableVariant(variant, command)
            );

      if (!matchingVariants.length) {
        continue;
      }

      const groupData = getOrCreate(entry.group);
      const formatted = formatEnvironmentVariableEntry(
        entry,
        matchingVariants,
        extraIndent
      );

      if (entry.scope) {
        const scopeEntries = groupData.scoped.get(entry.scope) || [];
        scopeEntries.push(...formatted);
        groupData.scoped.set(entry.scope, scopeEntries);
      } else {
        groupData.unscoped.push(...formatted);
      }
      continue;
    }

    if (
      command &&
      !includeAll &&
      !matchesEnvironmentVariableEntry(entry, command)
    ) {
      continue;
    }

    const groupData = getOrCreate(entry.group);
    const formatted = formatEnvironmentVariableEntry(entry, [], extraIndent);

    if (entry.scope) {
      const scopeEntries = groupData.scoped.get(entry.scope) || [];
      scopeEntries.push(...formatted);
      groupData.scoped.set(entry.scope, scopeEntries);
    } else {
      groupData.unscoped.push(...formatted);
    }
  }

  return groupedEntries;
}

/**
 * Renders environment variable help with:
 * - deterministic top-level group ordering
 * - inline deployment labels for mixed deployment commands
 * - flat output for single deployment commands
 * @param groupedEntries Output of `collectEnvironmentVariableGroups`.
 * @param command Command context used for type resolution.
 * @param supportedTypes Deployment types used for stub/global rendering.
 * @returns Fully rendered environment variable section (or empty string).
 */
function renderEnvironmentVariableGroups(
  groupedEntries: Map<string, GroupData>,
  command?: FrodoCommand,
  supportedTypes?: string[]
) {
  const effectiveTypes = command?.types || supportedTypes;
  const isSingleType = isSingleDeploymentType(effectiveTypes);

  const sections = environmentVariableGroupOrder.flatMap((group) => {
    const groupData = groupedEntries.get(group);
    if (!groupData) {
      return [];
    }

    const baseLines: string[] = [...groupData.unscoped];
    if (isSingleType) {
      for (const scope of environmentVariableScopeOrder) {
        const scopeEntries = groupData.scoped.get(scope);
        if (!scopeEntries || scopeEntries.length === 0) {
          continue;
        }
        baseLines.push(...scopeEntries);
      }
    } else {
      for (const scope of environmentVariableScopeOrder) {
        const scopeEntries = groupData.scoped.get(scope);
        if (!scopeEntries || scopeEntries.length === 0) {
          continue;
        }

        const deploymentType = getDeploymentTypeForScope(scope);
        baseLines.push('');
        baseLines.push(`    (${toDeploymentOnlyLabel(deploymentType)}):`);
        baseLines.push(...scopeEntries);
      }
    }

    if (!baseLines.length) {
      return [];
    }

    return ['', `  ${group}`, ...baseLines];
  });

  if (!sections.length) {
    return '';
  }

  while (sections[0] === '') {
    sections.shift();
  }

  return `\nEnvironment Variables:\n\n${sections.join('\n')}\n`;
}

/**
 * Generates a deployment type label for single-deployment-type commands.
 * @param command The command to check.
 * @returns Label like `Cloud-only` for single-type commands, otherwise empty.
 */
function getDeploymentTypeLabel(command?: CommandWithTypes): string {
  if (!command || !command.types || command.types.length === 0) {
    return '';
  }

  if (command.types.length === 1) {
    return toDeploymentOnlyLabel(command.types[0]);
  }

  return '';
}

/**
 * Converts deployment keys to display labels.
 *
 * Use this to preserve canonical casing for known values (e.g. `ForgeOps`)
 * while still producing reasonable labels for future camelCase values.
 * @param type Canonical deployment type key.
 * @returns Human-friendly deployment display label.
 */
function getDeploymentTypeDisplayLabel(type: string): string {
  switch (type) {
    case constants.CLASSIC_DEPLOYMENT_TYPE_KEY:
      return 'Classic';
    case constants.CLOUD_DEPLOYMENT_TYPE_KEY:
      return 'Cloud';
    case constants.FORGEOPS_DEPLOYMENT_TYPE_KEY:
      return 'ForgeOps';
    default:
      // Preserve existing camelCase/PascalCase beyond the first character.
      return `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
  }
}

/**
 * Produces standardized deployment labels used in help output such as
 * `Cloud-only`, `Classic-only`, or `ForgeOps-only`.
 * @param type Canonical deployment type key.
 * @returns `Type-only` label for help rendering.
 */
function toDeploymentOnlyLabel(type: string): string {
  return `${getDeploymentTypeDisplayLabel(type)}-only`;
}

/**
 * Maps deployment type keys to the corresponding scoped section token.
 * @param type Canonical deployment type key.
 * @returns Matching scope token or undefined when unsupported.
 */
function getScopeForDeploymentType(type: string): DeploymentScope | undefined {
  switch (type) {
    case constants.CLASSIC_DEPLOYMENT_TYPE_KEY:
      return 'classic-only';
    case constants.CLOUD_DEPLOYMENT_TYPE_KEY:
      return 'cloud-only';
    case constants.FORGEOPS_DEPLOYMENT_TYPE_KEY:
      return 'forgeops-only';
    default:
      return undefined;
  }
}

/**
 * Determines whether an option should be rendered in a deployment-scoped
 * sub-section when a command supports multiple deployment types.
 * @param option Option to classify.
 * @param commandTypes Deployment types supported by the command.
 * @returns Scope token when option is single-type constrained.
 */
function getSingleTypeScopeForOption(
  option: Option,
  commandTypes?: string[]
): DeploymentScope | undefined {
  if (!commandTypes || commandTypes.length <= 1) {
    return undefined;
  }

  const appliesToTypes = getOptionAppliesToTypes(option);
  if (!appliesToTypes || appliesToTypes.length !== 1) {
    return undefined;
  }

  const onlyType = appliesToTypes[0];
  if (!commandTypes.includes(onlyType)) {
    return undefined;
  }

  return getScopeForDeploymentType(onlyType);
}

/**
 * Splits option list into unscoped and scoped subsets for inline help
 * rendering in `formatHelp`.
 * @param options Option list for one heading.
 * @param commandTypes Deployment types supported by the command.
 * @returns Option groups partitioned by scope.
 */
function collectOptionGroupsByScope(
  options: Option[],
  commandTypes?: string[]
): OptionGroupData {
  const grouped: OptionGroupData = {
    unscoped: [],
    scoped: new Map<DeploymentScope, Option[]>(),
  };

  for (const option of options) {
    const scope = getSingleTypeScopeForOption(option, commandTypes);
    if (!scope) {
      grouped.unscoped.push(option);
      continue;
    }

    const entries = grouped.scoped.get(scope) || [];
    entries.push(option);
    grouped.scoped.set(scope, entries);
  }

  return grouped;
}

/**
 * Determines whether a subcommand belongs to a single deployment-only
 * section in stub command help.
 * @param command Subcommand to classify.
 * @returns Scope token when subcommand is single-type constrained.
 */
function getSingleTypeScopeForCommand(
  command: Command
): DeploymentScope | undefined {
  const typedCommand = command as CommandWithTypes;
  if (!typedCommand.types || typedCommand.types.length !== 1) {
    return undefined;
  }

  return getScopeForDeploymentType(typedCommand.types[0]);
}

/**
 * Splits subcommands into unscoped and scoped subsets for inline scoped
 * command sections in stub help.
 * @param commands Command list for one heading.
 * @returns Command groups partitioned by scope.
 */
function collectCommandGroupsByScope(commands: Command[]): CommandGroupData {
  const grouped: CommandGroupData = {
    unscoped: [],
    scoped: new Map<DeploymentScope, Command[]>(),
  };

  for (const command of commands) {
    const scope = getSingleTypeScopeForCommand(command);
    if (!scope) {
      grouped.unscoped.push(command);
      continue;
    }

    const entries = grouped.scoped.get(scope) || [];
    entries.push(command);
    grouped.scoped.set(scope, entries);
  }

  return grouped;
}

/**
 * Declares which deployment types each default option applies to.
 *
 * Update this when adding deployment-constrained default options so mixed
 * deployment help can render scoped sub-labels correctly.
 * @param option Default/global option.
 * @returns Deployment types for the option, or undefined when unscoped.
 */
function getOptionAppliesToTypes(option: Option): string[] | undefined {
  // Keep this mapping aligned with option semantics. It is used only for help
  // rendering to decide when options should appear under scoped sub-labels.
  switch (option.name()) {
    case loginClientId.name():
    case loginRedirectUri.name():
      return [
        constants.CLOUD_DEPLOYMENT_TYPE_KEY,
        constants.FORGEOPS_DEPLOYMENT_TYPE_KEY,
      ];
    case serviceAccountIdOption.name():
    case serviceAccountJwkFileOption.name():
      return [constants.CLOUD_DEPLOYMENT_TYPE_KEY];
    case amsterPrivateKeyPassphraseOption.name():
    case amsterPrivateKeyFileOption.name():
      return [constants.CLASSIC_DEPLOYMENT_TYPE_KEY];
    default:
      return undefined;
  }
}

/**
 * Generates command-scoped environment variable help for leaf commands.
 * @param command Command being rendered.
 * @param includeAll When true, bypass command include filters.
 * @returns Rendered environment variable section.
 */
function formatEnvironmentVariables(command: FrodoCommand, includeAll = false) {
  const groupedEntries = collectEnvironmentVariableGroups(
    command,
    includeAll,
    command.types
  );

  return renderEnvironmentVariableGroups(
    groupedEntries,
    command,
    command.types
  );
}

/**
 * Generates environment variable help for stub commands that aggregate
 * deployment support from their children.
 * @param supportedTypes Deployment types supported by child commands.
 * @returns Rendered environment variable section.
 */
export function formatGlobalEnvironmentVariables(supportedTypes?: string[]) {
  // Global help always shows scope headings (no specific command context)
  return renderEnvironmentVariableGroups(
    collectEnvironmentVariableGroups(undefined, false, supportedTypes),
    undefined,
    supportedTypes
  );
}

function getHelpLevel(argv: string[] = process.argv): 1 | 2 | 3 {
  if (argv.includes(HELP_ALL_SHORT_FLAG) || argv.includes(HELP_ALL_FLAG))
    return 3;
  if (argv.includes(HELP_MORE_SHORT_FLAG) || argv.includes(HELP_MORE_FLAG))
    return 2;
  return 1;
}

export function isExpandedHelpRequested(argv: string[] = process.argv) {
  return getHelpLevel(argv) >= 2;
}

export function isFullHelpRequested(argv: string[] = process.argv) {
  return getHelpLevel(argv) >= 3;
}

export function normalizeExpandedHelpArgv(argv: string[] = process.argv) {
  const normalizedArgv: string[] = [];

  for (const token of argv) {
    if (token === HELP_ALL_SHORT_FLAG) {
      normalizedArgv.push(HELP_ALL_FLAG, '--help');
    } else if (token === HELP_MORE_SHORT_FLAG) {
      normalizedArgv.push(HELP_MORE_FLAG, '--help');
    } else {
      normalizedArgv.push(token);
    }
  }

  return normalizedArgv;
}

const warnedStabilityCommands = new Set<string>();
const warnedStabilityOptions = new Set<string>();

/**
 * Builds a user-facing command path for warnings/errors.
 * @param command Command instance.
 * @returns Command path, e.g. `frodo shell`.
 */
function getCommandPath(command: Command): string {
  const names: string[] = [];
  let current: Command | null = command;
  while (current) {
    if (current.name()) {
      names.unshift(current.name());
    }
    current = current.parent || null;
  }
  return names.join(' ');
}

/**
 * Returns a user-facing identifier for an option.
 * @param option Option metadata.
 * @returns Preferred long flag or raw flags string.
 */
function getOptionLabel(option: Option): string {
  return option.long || option.flags;
}

/**
 * Converts option name (`enable-preview`) into Commander attribute name.
 * @param optionName Dashed option name.
 * @returns CamelCase attribute key.
 */
function toOptionAttributeName(optionName: string): string {
  return optionName.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * Returns true if value is treated as enabled for opt-in checks.
 * @param value Value to evaluate.
 * @returns Truthy opt-in interpretation.
 */
function isTruthyOptInValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
}

/**
 * Checks whether an opt-in gate has been satisfied.
 * @param command Command being executed.
 * @param gate Gate configuration.
 * @returns True when execution is allowed.
 */
function isStabilityGateSatisfied(
  command: Command,
  gate: StabilityGateConfig
): boolean {
  const mode = gate.mode || 'option-or-env';
  const optionName = gate.optionName || 'enable-preview';
  const envVarName = gate.envVarName || 'FRODO_ENABLE_PREVIEW';

  const options = command.optsWithGlobals<Record<string, unknown>>();
  const optionKey = toOptionAttributeName(optionName);
  const optionEnabled = isTruthyOptInValue(options?.[optionKey]);
  const envEnabled = isTruthyOptInValue(process.env[envVarName]);

  switch (mode) {
    case 'option-only':
      return optionEnabled;
    case 'env-only':
      return envEnabled;
    default:
      return optionEnabled || envEnabled;
  }
}

/**
 * Returns whether an option was explicitly supplied or otherwise set from a
 * non-default source.
 * @param command Command being executed.
 * @param option Option to inspect.
 * @returns True when option value source is non-default.
 */
function isOptionUsed(command: Command, option: Option): boolean {
  const source = command.getOptionValueSourceWithGlobals(
    option.attributeName()
  );
  return !!source && source !== 'default';
}

/**
 * Enforces stability gate and prints warnings for non-stable options that were
 * actually used.
 * @param actionCommand Concrete command being executed.
 */
function enforceOptionStabilityAndWarn(actionCommand: Command): void {
  for (const option of actionCommand.options) {
    const metadata = getStabilityMetadata(option);
    if (metadata.level === 'stable' || !isOptionUsed(actionCommand, option)) {
      continue;
    }

    const commandPath = getCommandPath(actionCommand);
    const optionLabel = getOptionLabel(option);
    const warningKey = `${commandPath}::${optionLabel}`;

    if (metadata.gate?.requiredOptIn) {
      const gate = metadata.gate;
      if (!isStabilityGateSatisfied(actionCommand, gate)) {
        const optionName = gate.optionName || 'enable-preview';
        const envVarName = gate.envVarName || 'FRODO_ENABLE_PREVIEW';
        const mode = gate.mode || 'option-or-env';
        const guidance =
          mode === 'option-only'
            ? `Use '--${optionName}'.`
            : mode === 'env-only'
              ? `Set '${envVarName}=true'.`
              : `Use '--${optionName}' or set '${envVarName}=true'.`;
        throw new FrodoError(
          `${formatStabilityLevel(metadata.level)} option '${optionLabel}' on command '${commandPath}' requires explicit opt-in. ${guidance}`
        );
      }
    }

    if (!warnedStabilityOptions.has(warningKey)) {
      const suffix = metadata.gate?.requiredOptIn
        ? metadata.level === 'deprecated'
          ? ' This option is opt-in, deprecated, and may be removed in a future release.'
          : ' This option is opt-in and may change without notice.'
        : metadata.level === 'deprecated'
          ? ' This option is deprecated and may be removed in a future release.'
          : ' This option may change without notice.';
      printMessage(
        `${formatStabilityLevel(metadata.level)} option in use: '${optionLabel}' on command '${commandPath}'.${suffix}`,
        'warn'
      );
      warnedStabilityOptions.add(warningKey);
    }
  }
}

/**
 * Enforces stability gate and prints warnings for non-stable commands.
 * @param actionCommand Concrete command being executed.
 */
function enforceStabilityAndWarn(actionCommand: Command): void {
  const metadata = getEffectiveCommandStabilityMetadata(actionCommand);
  if (metadata.level === 'stable') {
    return;
  }

  const commandPath = getCommandPath(actionCommand);

  if (metadata.gate?.requiredOptIn) {
    const gate = metadata.gate;
    if (!isStabilityGateSatisfied(actionCommand, gate)) {
      const optionName = gate.optionName || 'enable-preview';
      const envVarName = gate.envVarName || 'FRODO_ENABLE_PREVIEW';
      const mode = gate.mode || 'option-or-env';
      const guidance =
        mode === 'option-only'
          ? `Use '--${optionName}'.`
          : mode === 'env-only'
            ? `Set '${envVarName}=true'.`
            : `Use '--${optionName}' or set '${envVarName}=true'.`;
      throw new FrodoError(
        `${formatStabilityLevel(metadata.level)} command '${commandPath}' requires explicit opt-in. ${guidance}`
      );
    }
  }

  if (!warnedStabilityCommands.has(commandPath)) {
    const gateSuffix = metadata.gate?.requiredOptIn
      ? metadata.level === 'deprecated'
        ? ' This command is opt-in, deprecated, and may be removed in a future release.'
        : ' This feature is opt-in and may change without notice.'
      : metadata.level === 'deprecated'
        ? ' This command is deprecated and may be removed in a future release.'
        : ' This feature may change without notice.';
    printMessage(
      `${formatStabilityLevel(metadata.level)} feature in use: '${commandPath}'.${gateSuffix}`,
      'warn'
    );
    warnedStabilityCommands.add(commandPath);
  }

  enforceOptionStabilityAndWarn(actionCommand);
}

/**
 * Command with default options
 */
export class FrodoStubCommand extends Command {
  /**
   * Command stability metadata. Defaults to stable.
   */
  [STABILITY_METADATA_KEY]?: StabilityMetadata;

  types?: string[];

  /**
   * Creates a new FrodoCommand instance
   * @param name Name of the command
   */
  constructor(name: string) {
    super(name);

    if (!process.listenerCount('unhandledRejection')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      process.on('unhandledRejection', (error: any) => {
        printError(
          new FrodoError(
            `Please report this unhandled error here: https://github.com/rockcarver/frodo-cli/issues`,
            error
          )
        );
        process.exitCode = 1;
      });
    }

    // other default settings
    this.helpOption('-h, --help', 'Help');
    this.addOption(
      withHelpGroup(
        new Option(HELP_MORE_FLAG, 'Help with all options.'),
        HELP_OPTIONS_HEADING
      )
    );
    this.addOption(
      withHelpGroup(
        new Option(
          HELP_ALL_FLAG,
          'Help with all options, environment variables, and usage examples.'
        ),
        HELP_OPTIONS_HEADING
      )
    );
    this.showHelpAfterError();
    this.configureHelp({
      sortSubcommands: true,
      sortOptions: true,
    });
    this.options
      .find((option) => option.name() === 'help')
      ?.helpGroup(HELP_OPTIONS_HEADING);
    this.addHelpText('after', () => {
      if (!isFullHelpRequested()) {
        return '';
      }

      // FrodoCommand appends its own scoped env reference.
      if (this instanceof FrodoCommand) {
        return '';
      }

      // Root help wiring in app.ts already handles its own expanded env section.
      if (this.name() === 'frodo') {
        return '';
      }

      return formatGlobalEnvironmentVariables(this.types);
    });

    // register default handlers
    state.setPrintHandler(printMessage);
    state.setVerboseHandler(verboseMessage);
    state.setDebugHandler(debugMessage);
    state.setCurlirizeHandler(curlirizeMessage);
    state.setCreateProgressHandler(createProgressIndicator);
    state.setUpdateProgressHandler(updateProgressIndicator);
    state.setStopProgressHandler(stopProgressIndicator);

    // shutdown handlers
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.hook('postAction', (thisCommand, actionCommand) => {
      debugMessage(
        `FrodoCommand: running postAction hook: this command: ${thisCommand.name()}, action command: ${actionCommand.name()}`
      );
      cleanupProgressIndicators();
    });

    this.hook('preAction', (_thisCommand, actionCommand) => {
      enforceStabilityAndWarn(actionCommand);
    });
  }

  /**
   * Marks a command stability level and optionally requires explicit opt-in.
   * Stable is the default and requires no call sites.
   * @param level Stability indicator.
   * @param gate Optional gate configuration for high-risk features.
   * @returns This command for chaining.
   */
  withStability(level: StabilityIndicator, gate?: StabilityGateConfig): this {
    const normalizedGate = gate?.requiredOptIn
      ? {
          requiredOptIn: true,
          optionName: gate.optionName || 'enable-preview',
          envVarName: gate.envVarName || 'FRODO_ENABLE_PREVIEW',
          helpText: gate.helpText,
          mode: gate.mode || 'option-or-env',
        }
      : gate;

    setStabilityMetadata(this, { level, gate: normalizedGate });

    if (normalizedGate?.requiredOptIn) {
      const optionName = normalizedGate.optionName || 'enable-preview';
      const optionExists = this.options.some(
        (option) =>
          option.name() === optionName || option.attributeName() === optionName
      );

      if (!optionExists) {
        const envVarName = normalizedGate.envVarName || 'FRODO_ENABLE_PREVIEW';
        const helpText =
          normalizedGate.helpText ||
          `Opt in to ${level} feature execution. You can also set ${envVarName}=true.`;
        this.addOption(
          withHelpGroup(
            new Option(`--${optionName}`, helpText),
            HELP_OPTIONS_HEADING
          )
        );
      }
    }

    return this;
  }

  override addCommand(
    command: Command,
    opts?: Parameters<Command['addCommand']>[1]
  ) {
    const typedCommand = command as CommandWithTypes;
    if (typedCommand.types && typedCommand.types.length > 0) {
      const currentTypes = this.types || [];
      this.types = [...new Set([...currentTypes, ...typedCommand.types])];
    }

    if (!command.helpGroup()) {
      command.helpGroup(COMMANDS_HEADING);
    }

    return super.addCommand(command, opts);
  }

  override addHelpText(
    position: 'beforeAll' | 'before' | 'after' | 'afterAll',
    text: string | ((context: AddHelpTextContext) => string)
  ): this {
    if (position === 'after' && typeof text === 'string') {
      return super.addHelpText(position, () =>
        isFullHelpRequested() ? text : ''
      );
    }
    if (typeof text === 'string') {
      return super.addHelpText(position, text);
    }
    return super.addHelpText(position, text);
  }

  createHelp() {
    return Object.assign(new FrodoStubHelp(), this.configureHelp());
  }
}

class FrodoStubHelp extends Help {
  private readonly helpOptionOrder: Record<string, number> = {
    help: 0,
    'help-more': 1,
    'help-all': 2,
  };

  /**
   * Custom help renderer that extends Commander output with deployment-aware
   * inline sub-sections for options and subcommands.
   *
   * If you add new default option groups or deployment scopes, update helper
   * functions (`collectOptionGroupsByScope`, `environmentVariableScopeOrder`,
   * and related mappings) rather than editing rendering loops directly.
   * @param cmd Command being rendered.
   * @param helper Commander help helper instance.
   * @returns Fully rendered help text for the command.
   */
  override formatHelp(cmd: Command, helper: Help): string {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth ?? 80;

    function callFormatItem(term: string, description: string) {
      return helper.formatItem(term, termWidth, description, helper);
    }

    let output = [
      `${helper.styleTitle('Usage:')} ${helper.styleUsage(helper.commandUsage(cmd))}`,
      '',
    ];

    const commandDescription = helper.commandDescription(cmd);
    if (commandDescription.length > 0) {
      output = output.concat([
        helper.boxWrap(
          helper.styleCommandDescription(commandDescription),
          helpWidth
        ),
        '',
      ]);
    }

    const argumentList = helper.visibleArguments(cmd).map((argument) => {
      return callFormatItem(
        helper.styleArgumentTerm(helper.argumentTerm(argument)),
        helper.styleArgumentDescription(helper.argumentDescription(argument))
      );
    });
    output = output.concat(
      this.formatItemList('Arguments:', argumentList, helper)
    );

    // Add deployment type indicator after Usage/Description/Arguments for single-type commands.
    const typedCmd = cmd as CommandWithTypes;
    const typeLabel = getDeploymentTypeLabel(typedCmd);
    if (typeLabel) {
      output.push(`Deployment: ${typeLabel}`, '');
    }

    const optionGroups = this.groupItems(
      [...cmd.options],
      [...helper.visibleOptions(cmd)],
      (option) => option.helpGroupHeading ?? 'Options:'
    );
    const orderedOptionGroups = [...optionGroups.entries()].sort(
      ([leftGroup], [rightGroup]) => {
        if (leftGroup === COMMAND_OPTIONS_HEADING) {
          return -1;
        }

        if (rightGroup === COMMAND_OPTIONS_HEADING) {
          return 1;
        }

        return leftGroup.localeCompare(rightGroup, undefined, {
          sensitivity: 'base',
        });
      }
    );

    orderedOptionGroups.forEach(([group, options]) => {
      const scopedGroups = collectOptionGroupsByScope(options, typedCmd.types);
      const optionLines = scopedGroups.unscoped.map((option) => {
        return callFormatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option))
        );
      });

      for (const scope of environmentVariableScopeOrder) {
        const scopedOptions = scopedGroups.scoped.get(scope);
        if (!scopedOptions || scopedOptions.length === 0) {
          continue;
        }

        const deploymentType = getDeploymentTypeForScope(scope);
        optionLines.push('');
        optionLines.push(`  (${toDeploymentOnlyLabel(deploymentType)}):`);
        optionLines.push(
          ...scopedOptions.map((option) =>
            callFormatItem(
              helper.styleOptionTerm(helper.optionTerm(option)),
              helper.styleOptionDescription(helper.optionDescription(option))
            )
          )
        );
      }

      output = output.concat(this.formatItemList(group, optionLines, helper));
    });

    if (helper.showGlobalOptions) {
      const globalOptionList = helper
        .visibleGlobalOptions(cmd)
        .map((option) => {
          return callFormatItem(
            helper.styleOptionTerm(helper.optionTerm(option)),
            helper.styleOptionDescription(helper.optionDescription(option))
          );
        });
      output = output.concat(
        this.formatItemList('Global Options:', globalOptionList, helper)
      );
    }

    const commandGroups = this.groupItems(
      [...cmd.commands],
      [...helper.visibleCommands(cmd)],
      (sub) => sub.helpGroup() || 'Commands:'
    );
    commandGroups.forEach((commands, group) => {
      const scopedGroups = collectCommandGroupsByScope(commands);
      const commandList = scopedGroups.unscoped.map((sub) => {
        return callFormatItem(
          helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
          helper.styleSubcommandDescription(helper.subcommandDescription(sub))
        );
      });

      for (const scope of environmentVariableScopeOrder) {
        const scopedCommands = scopedGroups.scoped.get(scope);
        if (!scopedCommands || scopedCommands.length === 0) {
          continue;
        }

        const deploymentType = getDeploymentTypeForScope(scope);
        commandList.push('');
        commandList.push(`  (${toDeploymentOnlyLabel(deploymentType)}):`);
        commandList.push(
          ...scopedCommands.map((sub) =>
            callFormatItem(
              helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
              helper.styleSubcommandDescription(
                helper.subcommandDescription(sub)
              )
            )
          )
        );
      }

      output = output.concat(this.formatItemList(group, commandList, helper));
    });

    return output.join('\n');
  }

  /**
   * Decorates command description with stability badges.
   * @param cmd Command being rendered.
   * @returns Possibly decorated description.
   */
  override commandDescription(cmd: Command): string {
    return decorateDescriptionWithStability(super.commandDescription(cmd), cmd);
  }

  /**
   * Decorates subcommand description with stability badges.
   * @param cmd Subcommand being rendered.
   * @returns Possibly decorated description.
   */
  override subcommandDescription(cmd: Command): string {
    return decorateDescriptionWithStability(
      super.subcommandDescription(cmd),
      cmd
    );
  }

  /**
   * Decorates argument description with stability badges.
   * @param argument Argument being rendered.
   * @returns Possibly decorated description.
   */
  override argumentDescription(argument: Argument): string {
    return decorateDescriptionWithStability(
      super.argumentDescription(argument),
      argument
    );
  }

  /**
   * Decorates option description with stability badges.
   * @param option Option being rendered.
   * @returns Possibly decorated description.
   */
  override optionDescription(option: Option): string {
    return decorateDescriptionWithStability(
      super.optionDescription(option),
      option
    );
  }

  /**
   * Reorders options so help flags are always shown at the end.
   * @param options Visible options for a help section.
   * @returns Reordered options.
   */
  private orderHelpOptions(options: Option[]): Option[] {
    const indexed = options.map((option, index) => ({ option, index }));

    indexed.sort((left, right) => {
      const leftPriority = this.helpOptionOrder[left.option.name()];
      const rightPriority = this.helpOptionOrder[right.option.name()];
      const leftIsHelp = leftPriority !== undefined;
      const rightIsHelp = rightPriority !== undefined;

      if (leftIsHelp && rightIsHelp) {
        return leftPriority - rightPriority;
      }

      if (leftIsHelp) {
        return 1;
      }

      if (rightIsHelp) {
        return -1;
      }

      return left.index - right.index;
    });

    return indexed.map(({ option }) => option);
  }

  /**
   * Renders compact aliases for custom help flags.
   * @param option Option being rendered.
   * @returns Display term for the option.
   */
  override optionTerm(option: Option) {
    if (option.long === HELP_MORE_FLAG) {
      return `${HELP_MORE_SHORT_FLAG}, ${HELP_MORE_FLAG}`;
    }

    if (option.long === HELP_ALL_FLAG) {
      return `${HELP_ALL_SHORT_FLAG}, ${HELP_ALL_FLAG}`;
    }

    return super.optionTerm(option);
  }

  /**
   * Filters and orders visible options by help level.
   * @param cmd Command being rendered.
   * @returns Visible options for current help level.
   */
  override visibleOptions(cmd: Command): Option[] {
    // Base help (`-h`) intentionally hides advanced default option groups,
    // while expanded help (`-hh` / `-hhh`) shows everything.
    const allVisible = super.visibleOptions(cmd);

    if (getHelpLevel() >= 2) {
      return this.orderHelpOptions(allVisible);
    }

    return this.orderHelpOptions(
      allVisible.filter(
        (opt) =>
          opt.helpGroupHeading !== CONNECTION_OPTIONS_HEADING &&
          opt.helpGroupHeading !== AUTHENTICATION_OPTIONS_HEADING &&
          opt.helpGroupHeading !== RUNTIME_OPTIONS_HEADING &&
          opt.helpGroupHeading !== OUTPUT_OPTIONS_HEADING
      )
    );
  }

  /**
   * Uses visible-item ordering to keep dynamic scoped sections stable.
   * @param _unsortedItems Commander-provided original list (unused intentionally).
   * @param visibleItems Visible list after filtering.
   * @param getGroup Grouping selector.
   * @returns Group map with stable visible ordering.
   */
  override groupItems<T extends Command | Option>(
    _unsortedItems: T[],
    visibleItems: T[],
    getGroup: (item: T) => string
  ): Map<string, T[]> {
    // Seed group order from visible items so filtered and transformed sections
    // keep stable ordering with custom help rendering.
    return super.groupItems(visibleItems, visibleItems, getGroup);
  }

  /**
   * Renders subcommand term with first alias, if present.
   * @param cmd Subcommand.
   * @returns Display label for command list row.
   */
  subcommandTerm(cmd: Command) {
    const aliases = cmd.aliases();
    return cmd.name() + (aliases[0] ? '|' + aliases[0] : '');
  }
}

/**
 * Command with default options
 */
export class FrodoCommand extends FrodoStubCommand {
  /**
   * Explicit deployment types for this concrete command instance.
   */
  types: string[];

  /**
   * Creates a new FrodoCommand instance
   * @param name Name of the command
   * @param omits Array of default argument names and default option names that should not be added to this command
   * @param types Array of deployment types this command supports
   */
  constructor(
    name: string,
    omits: string[] = [],
    types: string[] = DEPLOYMENT_TYPES
  ) {
    super(name);

    this.types = types;
    this.allowExcessArguments();
    const commandOmits = new Set(omits);
    const supportsCloud = types.includes(constants.CLOUD_DEPLOYMENT_TYPE_KEY);
    const supportsForgeops = types.includes(
      constants.FORGEOPS_DEPLOYMENT_TYPE_KEY
    );

    // Cloud-only commands do not need Amster private key defaults.
    if (
      types.length === 1 &&
      types[0] === constants.CLOUD_DEPLOYMENT_TYPE_KEY
    ) {
      commandOmits.add(amsterPrivateKeyPassphraseOption.name());
      commandOmits.add(amsterPrivateKeyFileOption.name());
    }

    // Service account options are only applicable for cloud-supporting commands.
    if (!supportsCloud) {
      commandOmits.add(serviceAccountIdOption.name());
      commandOmits.add(serviceAccountJwkFileOption.name());
    }

    // Login client options are applicable only when cloud or forgeops is supported.
    if (!supportsCloud && !supportsForgeops) {
      commandOmits.add(loginClientId.name());
      commandOmits.add(loginRedirectUri.name());
    }

    // register default arguments
    // This is the primary extension point for adding CLI-wide arguments.
    for (const arg of defaultArgs) {
      if (!commandOmits.has(arg.name())) this.addArgument(arg);
    }

    // register default options
    // This is the primary extension point for adding CLI-wide options.
    for (const opt of defaultOpts) {
      if (!commandOmits.has(opt.name())) this.addOption(opt);
    }

    this.options
      .find((option) => option.name() === 'help')
      ?.helpGroup(HELP_OPTIONS_HEADING);

    // additional help
    this.addHelpText('after', () =>
      isFullHelpRequested() ? formatEnvironmentVariables(this) : ''
    );
  }

  /**
   * Adds and normalizes an option before registration.
   * @param option Option to add.
   * @returns This command for chaining.
   */
  override addOption(option: Option) {
    // Clone to avoid mutating shared default option instances.
    const commandOption = cloneOption(option);

    if (!commandOption.helpGroupHeading) {
      commandOption.helpGroup(COMMAND_OPTIONS_HEADING);
    }

    return super.addOption(commandOption);
  }

  /**
   * Adds a cloned argument to avoid mutating shared definitions.
   * @param argument Argument to add.
   * @returns This command for chaining.
   */
  override addArgument(argument: Argument) {
    // Clone to avoid mutating shared default argument instances.
    return super.addArgument(cloneArgument(argument));
  }

  /**
   * Used by env var include predicates to detect whether a default argument
   * is currently present on this command.
   * @param argumentName Argument name to test.
   * @returns True when argument is present.
   */
  hasDefaultArgument(argumentName: string) {
    return this.registeredArguments.some(
      (argument) => argument.name() === argumentName
    );
  }

  /**
   * Used by env var include predicates to detect whether a default option
   * is currently present on this command.
   * @param optionName Option attribute/name to test.
   * @returns True when option is present.
   */
  hasDefaultOption(optionName: string) {
    return this.options.some(
      (option) =>
        option.attributeName() === optionName || option.name() === optionName
    );
  }

  /**
   * Applies shared default argument/option handlers to runtime state and then
   * invokes command-specific handler logic.
   * @param args Commander action arguments where trailing values are options and command.
   * @returns Promise from command action flow.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleDefaultArgsAndOpts(...args: any) {
    const command = args.pop();
    const options = args.pop();

    // handle arguments first
    for (const [i, v] of command.args.entries()) {
      if (!command._args[i]) {
        printMessage(
          `${command.args.length} arguments supplied but command only supports ${command._args.length}.`,
          'warn'
        );
        break;
      }
      const arg = command._args[i].name();
      // handle only default arguments
      if (Object.keys(stateMap).includes(arg)) {
        debugMessage(
          `FrodoCommand.handleDefaultArgsAndOpts: Handling default argument '${arg}'.`
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handler: any = stateMap[arg];
        handler(v);
      } else {
        debugMessage(
          `FrodoCommand.handleDefaultArgsAndOpts: Ignoring non-default argument '${arg}'.`
        );
      }
    }

    // handle options
    for (const [k, v] of Object.entries(options)) {
      // handle only default options
      if (Object.keys(stateMap).includes(k)) {
        debugMessage(
          `FrodoCommand.handleDefaultArgsAndOpts: Handling default option '${k}'.`
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handler: any = stateMap[k];
        handler(v, options);
      } else {
        debugMessage(
          `FrodoCommand.handleDefaultArgsAndOpts: Ignoring non-default option '${k}'.`
        );
      }
    }

    // fail fast if an incompatible deployment type option (-m or --type) was provided
    if (
      state.getDeploymentType() &&
      !this.types.includes(state.getDeploymentType())
    ) {
      throw new FrodoError(
        `Command does not support deployment type '${state.getDeploymentType()}'`
      );
    }
  }
}
