import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { RetryStrategy } from '@rockcarver/frodo-lib/types/api/BaseApi.js';
import { Argument, Command, Help, Option } from 'commander';
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

const {
  DEFAULT_REALM_KEY,
  DEPLOYMENT_TYPES,
  RETRY_STRATEGIES,
  RETRY_NOTHING_KEY,
} = frodo.utils.constants;
const { convertPrivateKeyToPem } = frodo.utils.crypto;

const COMMANDS_HEADING = 'Commands:';
const COMMAND_OPTIONS_HEADING = 'Options:';
const CONNECTION_OPTIONS_HEADING = 'Connection Options:';
const AUTHENTICATION_OPTIONS_HEADING = 'Authentication Options:';
const RUNTIME_OPTIONS_HEADING = 'Runtime Options:';
const OUTPUT_OPTIONS_HEADING = 'Output Options:';
const SUPPORT_OPTIONS_HEADING = 'Options:';
const EXPANDED_HELP_FLAG = '-hh';
const HELP_ALL_FLAG = '--help-all';

type EnvironmentVariableDescriptor = {
  name: string;
  description: string;
  commandNames?: string[];
  include?: (command: FrodoCommand) => boolean;
};

function withHelpGroup(option: Option, group: string): Option {
  option.helpGroup(group);
  return option;
}

function cloneOption(option: Option): Option {
  return Object.assign(new Option(option.flags, option.description), {
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
}

function cloneArgument(argument: Argument): Argument {
  const bracketOpen = argument.required ? '<' : '[';
  const bracketClose = argument.required ? '>' : ']';
  const spec = `${bracketOpen}${argument.name()}${argument.variadic ? '...' : ''}${bracketClose}`;

  return Object.assign(new Argument(spec, argument.description), {
    defaultValue: argument.defaultValue,
    defaultValueDescription: argument.defaultValueDescription,
    parseArg: argument.parseArg,
    argChoices: argument.argChoices
      ? [...argument.argChoices]
      : argument.argChoices,
  });
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

const defaultArgs = [
  hostArgument,
  realmArgument,
  usernameArgument,
  passwordArgument,
];

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

const environmentVariables: EnvironmentVariableDescriptor[] = [
  {
    name: 'FRODO_HOST',
    description: "AM base URL. Overridden by 'host' argument.",
    include: (command) => command.hasDefaultArgument('host'),
  },
  {
    name: 'FRODO_IDM_HOST',
    description: "IDM base URL. Overridden by '--idm-host' option.",
    include: (command) =>
      command.hasDefaultOption(idmHostOption.attributeName()),
  },
  {
    name: 'FRODO_REALM',
    description: "Realm. Overridden by 'realm' argument.",
    include: (command) => command.hasDefaultArgument('realm'),
  },
  {
    name: 'FRODO_USERNAME',
    description: "Username. Overridden by 'username' argument.",
    include: (command) => command.hasDefaultArgument('username'),
  },
  {
    name: 'FRODO_PASSWORD',
    description: "Password. Overridden by 'password' argument.",
    include: (command) => command.hasDefaultArgument('password'),
  },
  {
    name: 'FRODO_LOGIN_CLIENT_ID',
    description:
      "OAuth2 client id for IDM API calls. Overridden by '--login-client-id' option.",
    include: (command) =>
      command.hasDefaultOption(loginClientId.attributeName()),
  },
  {
    name: 'FRODO_LOGIN_REDIRECT_URI',
    description:
      "Redirect Uri for custom OAuth2 client id. Overridden by '--login-redirect-uri' option.",
    include: (command) =>
      command.hasDefaultOption(loginRedirectUri.attributeName()),
  },
  {
    name: 'FRODO_SA_ID',
    description: "Service account uuid. Overridden by '--sa-id' option.",
    include: (command) =>
      command.hasDefaultOption(serviceAccountIdOption.attributeName()),
  },
  {
    name: 'FRODO_SA_JWK',
    description:
      "Service account JWK. Overridden by '--sa-jwk-file' option but takes the actual JWK as a value, not a file name.",
    include: (command) =>
      command.hasDefaultOption(serviceAccountJwkFileOption.attributeName()),
  },
  {
    name: 'FRODO_AMSTER_PASSPHRASE',
    description:
      "Passphrase for the Amster private key if it is encrypted. Overridden by '--passphrase' option.",
    include: (command) =>
      command.hasDefaultOption(
        amsterPrivateKeyPassphraseOption.attributeName()
      ),
  },
  {
    name: 'FRODO_AMSTER_PRIVATE_KEY',
    description:
      "Amster private key. Overridden by '--private-key' option but takes the actual private key as a value (i.e. the file contents), not a file name. Supported formats include PEM (both PKCS#1 and PKCS#8 variants), OpenSSH, DNSSEC, and JWK.",
    include: (command) =>
      command.hasDefaultOption(amsterPrivateKeyFileOption.attributeName()),
  },
  {
    name: 'FRODO_NO_CACHE',
    description: "Disable token cache. Same as '--no-cache' option.",
    include: (command) =>
      command.hasDefaultOption(noCacheOption.attributeName()),
  },
  {
    name: 'FRODO_TOKEN_CACHE_PATH',
    description:
      "Use this token cache file instead of '~/.frodo/TokenCache.json'.",
  },
  {
    name: 'FRODO_CONNECTION_PROFILES_PATH',
    description:
      "Use this connection profiles file instead of '~/.frodo/Connections.json'.",
  },
  {
    name: 'FRODO_AUTHENTICATION_SERVICE',
    description:
      "Name of a login journey to use. When using an Amster private key, specifies which journey to use for Amster authentication as opposed to the default 'amsterService' journey.",
  },
  {
    name: 'FRODO_AUTHENTICATION_HEADER_OVERRIDES',
    description:
      'Map of headers: \'{"host":"am.example.com:8081"}\'. These headers are sent with all requests and can be used to override default behavior, for example to set a custom host header for Proxy Connect-protected PingOne Advanced Identity Cloud environments.',
  },
  {
    name: 'FRODO_CONFIGURATION_HEADER_OVERRIDES',
    description:
      'Map of headers: \'{"X-Configuration-Type":"mutable"}\'. These headers are sent with all configuration requests and can be used to override default behavior, for example to set a custom configuration header for mutable PingOne Advanced Identity Cloud environments.',
  },
  {
    name: 'FRODO_DEBUG',
    description: "Set to any value to enable debug output. Same as '--debug'.",
    include: (command) => command.hasDefaultOption(debugOption.attributeName()),
  },
  {
    name: 'FRODO_IGA',
    description:
      'Set to "true" to enable IGA (Identity Governance) endpoints for cloud deployments, or "false" to disable them, overriding auto-detected value.',
  },
  {
    name: 'FRODO_MASTER_KEY_PATH',
    description:
      "Use this master key file instead of '~/.frodo/masterkey.key' file.",
  },
  {
    name: 'FRODO_MASTER_KEY',
    description:
      "Use this master key instead of what's in '~/.frodo/masterkey.key'. Takes precedence over FRODO_MASTER_KEY_PATH.",
  },
  {
    name: 'FRODO_LOG_KEY',
    description: "Log API key. Overridden by '--log-api-key' option.",
    commandNames: ['frodo conn save'],
  },
  {
    name: 'FRODO_LOG_SECRET',
    description: "Log API secret. Overridden by '--log-api-secret' option.",
    commandNames: ['frodo conn save'],
  },
  {
    name: 'FRODO_LOG_KEY',
    description: "Log API key. Overridden by 'username' argument.",
    include: (command) => command.name().startsWith('frodo log'),
  },
  {
    name: 'FRODO_LOG_SECRET',
    description: "Log API secret. Overridden by 'password' argument.",
    include: (command) => command.name().startsWith('frodo log'),
  },
];

function formatEnvironmentVariables(command: FrodoCommand, includeAll = false) {
  const entries = environmentVariables.filter((entry) => {
    if (includeAll) return true;
    if (entry.commandNames && !entry.commandNames.includes(command.name())) {
      return false;
    }
    if (entry.include) {
      return entry.include(command);
    }
    return true;
  });

  if (!entries.length) {
    return '';
  }

  const formattedEntries = entries.map(
    (entry) => `  ${entry.name}: ${entry.description}`
  );

  return `\nEnvironment Variables:\n${formattedEntries.join('\n')}\n`;
}

export function formatGlobalEnvironmentVariables() {
  const entries = environmentVariables.map(
    (entry) => `  ${entry.name}: ${entry.description}`
  );

  return `\nEnvironment Variables:\n${entries.join('\n')}\n`;
}

export function isExpandedHelpRequested(argv: string[] = process.argv) {
  return argv.includes(EXPANDED_HELP_FLAG) || argv.includes(HELP_ALL_FLAG);
}

export function normalizeExpandedHelpArgv(argv: string[] = process.argv) {
  const normalizedArgv: string[] = [];

  for (const token of argv) {
    if (token === EXPANDED_HELP_FLAG) {
      normalizedArgv.push(HELP_ALL_FLAG, '--help');
    } else {
      normalizedArgv.push(token);
    }
  }

  return normalizedArgv;
}

/**
 * Command with default options
 */
export class FrodoStubCommand extends Command {
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
        new Option(HELP_ALL_FLAG, 'Help plus environment variables reference.'),
        SUPPORT_OPTIONS_HEADING
      )
    );
    this.showHelpAfterError();
    this.configureHelp({
      sortSubcommands: true,
      sortOptions: true,
    });
    this.options
      .find((option) => option.name() === 'help')
      ?.helpGroup(SUPPORT_OPTIONS_HEADING);
    this.addHelpText('after', () => {
      if (!isExpandedHelpRequested()) {
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

      return formatGlobalEnvironmentVariables();
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
  }

  override addCommand(
    command: Command,
    opts?: Parameters<Command['addCommand']>[1]
  ) {
    if (!command.helpGroup()) {
      command.helpGroup(COMMANDS_HEADING);
    }

    return super.addCommand(command, opts);
  }

  createHelp() {
    return Object.assign(new FrodoStubHelp(), this.configureHelp());
  }
}

class FrodoStubHelp extends Help {
  override optionTerm(option: Option) {
    if (option.long === HELP_ALL_FLAG) {
      return `${EXPANDED_HELP_FLAG}, ${HELP_ALL_FLAG}`;
    }

    return super.optionTerm(option);
  }

  subcommandTerm(cmd: Command) {
    const aliases = cmd.aliases();
    return cmd.name() + (aliases[0] ? '|' + aliases[0] : '');
  }
}

/**
 * Command with default options
 */
export class FrodoCommand extends FrodoStubCommand {
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

    // register default arguments
    for (const arg of defaultArgs) {
      if (!omits.includes(arg.name())) this.addArgument(arg);
    }

    // register default options
    for (const opt of defaultOpts) {
      if (!omits.includes(opt.name())) this.addOption(opt);
    }

    this.options
      .find((option) => option.name() === 'help')
      ?.helpGroup(SUPPORT_OPTIONS_HEADING);

    // additional help
    this.addHelpText('after', () =>
      isExpandedHelpRequested() ? formatEnvironmentVariables(this) : ''
    );
  }

  override addOption(option: Option) {
    const commandOption = cloneOption(option);

    if (!commandOption.helpGroupHeading) {
      commandOption.helpGroup(COMMAND_OPTIONS_HEADING);
    }

    return super.addOption(commandOption);
  }

  override addArgument(argument: Argument) {
    return super.addArgument(cloneArgument(argument));
  }

  hasDefaultArgument(argumentName: string) {
    return this.registeredArguments.some(
      (argument) => argument.name() === argumentName
    );
  }

  hasDefaultOption(optionName: string) {
    return this.options.some(
      (option) =>
        option.attributeName() === optionName || option.name() === optionName
    );
  }

  /**
   *
   * @param args
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
