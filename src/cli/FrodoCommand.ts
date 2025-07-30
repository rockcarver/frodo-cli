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

const hostArgument = new Argument(
  '[host]',
  'AM base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just specify a unique substring.'
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

const idmHostOption = new Option(
  '--idm-host <idm-host>',
  'IDM base URL, e.g.: https://cdk.idm.example.com/myidm. Use only if your IDM installation resides in a different domain and/or if the base path differs from the default "/openidm".'
);

const loginClientId = new Option(
  '--login-client-id <client-id>',
  'Specify a custom OAuth2 client id to use a your own oauth2 client for IDM API calls in deployments of type "cloud" or "forgeops". Your custom client must be configured as a public client and allow the authorization code grant using the "openid fr:idm:*" scope. Use the "--redirect-uri" parameter if you have configured a custom redirect uri (default: "<host>/platform/appAuthHelperRedirect.html").'
);

const loginRedirectUri = new Option(
  '--login-redirect-uri <redirect-uri>',
  'Specify a custom redirect URI to use with your custom OAuth2 client (efault: "<host>/platform/appAuthHelperRedirect.html").'
);

const serviceAccountIdOption = new Option(
  '--sa-id <sa-id>',
  'Service account id.'
);

const serviceAccountJwkFileOption = new Option(
  '--sa-jwk-file <file>',
  'File containing the JSON Web Key (JWK) associated with the the service account.'
);

const amsterPrivateKeyPassphraseOption = new Option(
  '--passphrase <passphrase>',
  'The passphrase for the Amster private key if it is encrypted.'
);

const amsterPrivateKeyFileOption = new Option(
  '--private-key <file>',
  'File containing the private key for authenticating with Amster. Supported formats include PEM (both PKCS#1 and PKCS#8 variants), OpenSSH, DNSSEC, and JWK.'
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
).choices(DEPLOYMENT_TYPES);

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

const retryOption = new Option(
  '--retry <strategy>',
  `Retry failed operations. Valid values for strategy: \n\
everything: Retry all failed operations. \n\
network:    Retry only network-related failed operations. \n\
nothing:    Do not retry failed operations. \n\
The selected retry strategy controls how the CLI handles failures.`
)
  .choices(RETRY_STRATEGIES)
  .default(`${RETRY_NOTHING_KEY}`, `Do not retry failed operations.`);

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
  [flushCacheOption.attributeName()]: (flush: boolean) => {
    if (flush) frodo.cache.flush();
  },
  [retryOption.attributeName()]: (strategy: RetryStrategy) => {
    state.setAxiosRetryStrategy(strategy);
  },
};

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

  createHelp() {
    return Object.assign(new FrodoStubHelp(), this.configureHelp());
  }
}

class FrodoStubHelp extends Help {
  subcommandTerm(cmd) {
    return cmd._name + (cmd._aliases[0] ? '|' + cmd._aliases[0] : '');
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
      `\nEnvironment Variables:\n` +
        `  FRODO_HOST: AM base URL. Overridden by 'host' argument.\n` +
        `  FRODO_IDM_HOST: IDM base URL. Overridden by '--idm-host' option.\n` +
        `  FRODO_REALM: Realm. Overridden by 'realm' argument.\n` +
        `  FRODO_USERNAME: Username. Overridden by 'username' argument.\n` +
        `  FRODO_PASSWORD: Password. Overridden by 'password' argument.\n` +
        `  FRODO_LOGIN_CLIENT_ID: OAuth2 client id for IDM API calls. Overridden by '--login-client-id' option.\n` +
        `  FRODO_LOGIN_REDIRECT_URI: Redirect Uri for custom OAuth2 client id. Overridden by '--login-redirect-uri' option.\n` +
        `  FRODO_SA_ID: Service account uuid. Overridden by '--sa-id' option.\n` +
        `  FRODO_SA_JWK: Service account JWK. Overridden by '--sa-jwk-file' option but takes the actual JWK as a value, not a file name.\n` +
        `  FRODO_AMSTER_PASSPHRASE: Passphrase for the Amster private key if it is encrypted. Overridden by '--passphrase' option.\n` +
        `  FRODO_AMSTER_PRIVATE_KEY: Amster private key. Overridden by '--private-key' option but takes the actual private key as a value (i.e. the file contents), not a file name. Supported formats include PEM (both PKCS#1 and PKCS#8 variants), OpenSSH, DNSSEC, and JWK.\n` +
        `  FRODO_NO_CACHE: Disable token cache. Same as '--no-cache' option.\n` +
        `  FRODO_TOKEN_CACHE_PATH: Use this token cache file instead of '~/.frodo/TokenCache.json'.\n` +
        ('frodo conn save' === this.name()
          ? `  FRODO_LOG_KEY: Log API key. Overridden by '--log-api-key' option.\n` +
            `  FRODO_LOG_SECRET: Log API secret. Overridden by '--log-api-secret' option.\n`
          : ``) +
        (this.name().startsWith('frodo log')
          ? `  FRODO_LOG_KEY: Log API key. Overridden by 'username' argument.\n` +
            `  FRODO_LOG_SECRET: Log API secret. Overridden by 'password' argument.\n`
          : ``) +
        `  FRODO_CONNECTION_PROFILES_PATH: Use this connection profiles file instead of '~/.frodo/Connections.json'.\n` +
        `  FRODO_AUTHENTICATION_SERVICE: Name of a login journey to use. When using an Amster private key, specifies which journey to use for Amster authentication as opposed to the default 'amsterService' journey.\n` +
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
