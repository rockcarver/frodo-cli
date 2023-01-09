import { Argument, Command, Option } from 'commander';
import * as globalConfig from '../storage/StaticStorage';
import { state } from '@rockcarver/frodo-lib';
import fs from 'fs';
import {
  printMessage,
  createProgressIndicator,
  updateProgressIndicator,
  stopProgressIndicator,
  verboseMessage,
  debugMessage,
  curlirizeMessage,
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
  'File containing the java web key (jwk) associated with the the service account.'
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
  insecureOption,
  verboseOption,
  debugOption,
  curlirizeOption,
];

const stateMap = {
  [hostArgument.name()]: state.setHost,
  [realmArgument.name()]: state.setRealm,
  [usernameArgument.name()]: state.setUsername,
  [passwordArgument.name()]: state.setPassword,
  [serviceAccountIdOption.attributeName()]: state.setServiceAccountId,
  [serviceAccountJwkFileOption.attributeName()]: (file) => {
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
  [deploymentOption.attributeName()]: state.setDeploymentType,
  [insecureOption.attributeName()]: state.setAllowInsecureConnection,
  [verboseOption.attributeName()]: state.setVerbose,
  [debugOption.attributeName()]: state.setDebug,
  [curlirizeOption.attributeName()]: state.setCurlirize,
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
