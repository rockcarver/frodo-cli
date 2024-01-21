import { frodo, state } from '@rockcarver/frodo-lib';
import { Argument, Command, Option } from 'commander';
import fs from 'fs';

import * as globalConfig from '../storage/StaticStorage';
import {
  cleanupProgressIndicators,
  createProgressIndicator,
  curlirizeMessage,
  debugMessage,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
  verboseMessage,
} from '../utils/Console.js';

const hostArgument = new Argument(
  '[host]',
  'Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just specify a unique substring.'
);

const realmArgument = new Argument(
  '[realm]',
  "Realm. Specify realm as '/' for the root realm or 'realm' or '/parent/child' otherwise."
).default(
  // must check for FRODO_REALM env variable here because otherwise cli will overwrite realm with default value
  process.env.FRODO_REALM || globalConfig.DEFAULT_REALM_KEY,
  '"alpha" for Identity Cloud tenants, "/" otherwise.'
);

const usernameArgument = new Argument(
  '[username]',
  'Username to login with. Must be an admin user with appropriate rights to manage authentication journeys/trees.'
);

const passwordArgument = new Argument('[password]', 'Password.');

const serviceAccountIdOption = new Option(
  '--sa-id <sa-id>',
  'Service account id.'
);

const serviceAccountJwkFileOption = new Option(
  '--sa-jwk-file <file>',
  'File containing the JSON Web Key (JWK) associated with the the service account.'
);

const deploymentOption = new Option(
  '-m, --type <type>',
  'Override auto-detected deployment type. Valid values for type: \n\
classic:  A classic Access Management-only deployment with custom layout and configuration. \n\
cloud:    A ForgeRock Identity Cloud environment. \n\
forgeops: A ForgeOps CDK or CDM deployment. \n\
The detected or provided deployment type controls certain behavior like obtaining an Identity \
Management admin token or not and whether to export/import referenced email templates or how \
to walk through the tenant admin login flow of Identity Cloud and handle MFA'
).choices(globalConfig.DEPLOYMENT_TYPES);

const directoryOption = new Option(
  '-D, --directory <directory>',
  'Set the working directory.'
).default(undefined, 'undefined');

const insecureOption = new Option(
  '-k, --insecure',
  'Allow insecure connections when using SSL/TLS. Has no effect when using a network proxy for https (HTTPS_PROXY=http://<host>:<port>), in that case the proxy must provide this capability.'
).default(false, "Don't allow insecure connections");

const verboseOption = new Option(
  '--verbose',
  'Verbose output during command execution. If specified, may or may not produce additional output.'
);

const debugOption = new Option(
  '--debug',
  'Debug output during command execution. If specified, may or may not produce additional output helpful for troubleshooting.'
);

const curlirizeOption = new Option(
  '--curlirize',
  'Output all network calls in curl format.'
);

const noCacheOption = new Option(
  '--no-cache',
  'Disable token cache for this operation.'
);

const flushCacheOption = new Option('--flush-cache', 'Flush token cache.');

const defaultArgs = [
  hostArgument,
  realmArgument,
  usernameArgument,
  passwordArgument,
];

const defaultOpts = [
  serviceAccountIdOption,
  serviceAccountJwkFileOption,
  deploymentOption,
  directoryOption,
  insecureOption,
  verboseOption,
  debugOption,
  curlirizeOption,
  noCacheOption,
  flushCacheOption,
];

const stateMap = {
  [hostArgument.name()]: (host: string) => state.setHost(host),
  [realmArgument.name()]: (realm: string) => state.setRealm(realm),
  [usernameArgument.name()]: (username: string) => state.setUsername(username),
  [passwordArgument.name()]: (password: string) => state.setPassword(password),
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
  [deploymentOption.attributeName()]: (type: string) =>
    state.setDeploymentType(type),
  [directoryOption.attributeName()]: (directory: string) =>
    state.setDirectory(directory),
  [insecureOption.attributeName()]: (insecure: boolean) =>
    state.setAllowInsecureConnection(insecure),
  [verboseOption.attributeName()]: (verbose: boolean) =>
    state.setVerbose(verbose),
  [debugOption.attributeName()]: (debug: boolean) => state.setDebug(debug),
  [curlirizeOption.attributeName()]: (curlirize: boolean) =>
    state.setCurlirize(curlirize),
  [noCacheOption.attributeName()]: (cache: boolean) =>
    state.setUseTokenCache(cache),
  [flushCacheOption.attributeName()]: (flush: boolean) => {
    if (flush) frodo.cache.flush();
  },
};

/**
 * Command with default options
 */
export class FrodoStubCommand extends Command {
  /**
   * Creates a new FrodoCommand instance
   * @param name Name of the command
   * @param omits Array of default argument names and default option names that should not be added to this command
   */
  constructor(name: string) {
    super(name);

    if (!process.listenerCount('unhandledRejection')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      process.on('unhandledRejection', (error: any) => {
        printMessage(
          `${error.config?.method ? error.config.method + ' ' : ''}${
            error.config?.url ? error.config.url : ''
          }`,
          'error'
        );
        printMessage(error.response?.data, 'error');
        printMessage(error.stack, 'error');
        printMessage(
          `Please report this unhandled error here: https://github.com/rockcarver/frodo-cli/issues`,
          'error'
        );
        process.exitCode = 1;
      });
    }

    // other default settings
    this.helpOption('-h, --help', 'Help');
    this.showHelpAfterError();
    this.configureHelp({
      sortSubcommands: true,
      sortOptions: true,
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
}

/**
 * Command with default options
 */
export class FrodoCommand extends FrodoStubCommand {
  /**
   * Creates a new FrodoCommand instance
   * @param name Name of the command
   * @param omits Array of default argument names and default option names that should not be added to this command
   */
  constructor(name: string, omits: string[] = []) {
    super(name);

    // register default arguments
    for (const arg of defaultArgs) {
      if (!omits.includes(arg.name())) this.addArgument(arg);
    }

    // register default options
    for (const opt of defaultOpts) {
      if (!omits.includes(opt.name())) this.addOption(opt);
    }

    // additional help
    this.addHelpText(
      'after',
      `\nEvironment Variables:\n` +
        `  FRODO_HOST: Access Management base URL. Overrides 'host' argument.\n` +
        `  FRODO_REALM: Realm. Overrides 'realm' argument.\n` +
        `  FRODO_USERNAME: Username. Overrides 'username' argument.\n` +
        `  FRODO_PASSWORD: Password. Overrides 'password' argument.\n` +
        `  FRODO_SA_ID: Service account uuid. Overrides '--sa-id' option.\n` +
        `  FRODO_SA_JWK: Service account JWK. Overrides '--sa-jwk-file' option but takes the actual JWK as a value, not a file name.\n` +
        `  FRODO_NO_CACHE: Disable token cache. Same as '--no-cache' option.\n` +
        `  FRODO_TOKEN_CACHE_PATH: Use this token cache file instead of '~/.frodo/TokenCache.json'.\n` +
        ('frodo conn save' === this.name()
          ? `  FRODO_LOG_KEY: Log API key. Overrides '--log-api-key' option.\n` +
            `  FRODO_LOG_SECRET: Log API secret. Overrides '--log-api-secret' option.\n`
          : ``) +
        (this.name().startsWith('frodo log')
          ? `  FRODO_LOG_KEY: Log API key. Overrides 'username' argument.\n` +
            `  FRODO_LOG_SECRET: Log API secret. Overrides 'password' argument.\n`
          : ``) +
        `  FRODO_CONNECTION_PROFILES_PATH: Use this connection profiles file instead of '~/.frodo/Connections.json'.\n` +
        `  FRODO_AUTHENTICATION_SERVICE: Name of a login journey to use.\n` +
        `  FRODO_DEBUG: Set to any value to enable debug output. Same as '--debug'.\n` +
        `  FRODO_MASTER_KEY_PATH: Use this master key file instead of '~/.frodo/masterkey.key' file.\n` +
        `  FRODO_MASTER_KEY: Use this master key instead of what's in '~/.frodo/masterkey.key'. Takes precedence over FRODO_MASTER_KEY_PATH.\n`
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
        handler(v);
      } else {
        debugMessage(
          `FrodoCommand.handleDefaultArgsAndOpts: Ignoring non-default option '${k}'.`
        );
      }
    }
  }
}
