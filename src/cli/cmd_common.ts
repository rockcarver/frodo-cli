import { Argument, Option } from 'commander';
import { state } from '@rockcarver/frodo-lib';
import * as globalConfig from '../storage/StaticStorage';
import {
  printMessage,
  createProgressIndicator,
  updateProgressIndicator,
  stopProgressIndicator,
  verboseMessage,
  debugMessage,
  curlirizeMessage,
} from '../utils/Console.js';

state.setPrintHandler(printMessage);
state.setVerboseHandler(verboseMessage);
state.setDebugHandler(debugMessage);
state.setCurlirizeHandler(curlirizeMessage);
state.setCreateProgressHandler(createProgressIndicator);
state.setUpdateProgressHandler(updateProgressIndicator);
state.setStopProgressHandler(stopProgressIndicator);

export function init() {
  // pseudo functions for commands that do not otherwise need to import
  // this file but need to trigger print and progress handler registration
}

export const hostArgument = new Argument(
  '[host]',
  'Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just specify a unique substring.'
);

export const realmArgument = new Argument(
  '[realm]',
  "Realm. Specify realm as '/' for the root realm or 'realm' or '/parent/child' otherwise."
).default(
  // must check for FRODO_REALM env variable here because otherwise cli will overwrite realm with default value
  process.env.FRODO_REALM || globalConfig.DEFAULT_REALM_KEY,
  '"alpha" for Identity Cloud tenants, "/" otherwise.'
);

export const usernameArgument = new Argument(
  '[username]',
  'Username to login with. Must be an admin user with appropriate rights to manage authentication journeys/trees.'
);

export const passwordArgument = new Argument('[password]', 'Password.');

export const apiKeyArgument = new Argument('[key]', 'API key for logging API.');

export const apiSecretArgument = new Argument(
  '[secret]',
  'API secret for logging API.'
);

export const deploymentOption = new Option(
  '-m, --type <type>',
  'Override auto-detected deployment type. Valid values for type: \n\
classic:  A classic Access Management-only deployment with custom layout and configuration. \n\
cloud:    A ForgeRock Identity Cloud environment. \n\
forgeops: A ForgeOps CDK or CDM deployment. \n\
The detected or provided deployment type controls certain behavior like obtaining an Identity \
Management admin token or not and whether to export/import referenced email templates or how \
to walk through the tenant admin login flow of Identity Cloud and handle MFA'
).choices(globalConfig.DEPLOYMENT_TYPES);

export const insecureOption = new Option(
  '-k, --insecure',
  'Allow insecure connections when using SSL/TLS. Has no effect when using a network proxy for https (HTTPS_PROXY=http://<host>:<port>), in that case the proxy must provide this capability.'
).default(false, "Don't allow insecure connections");

export const verboseOption = new Option(
  '--verbose',
  'Verbose output during command execution. If specified, may or may not produce additional output.'
);

export const debugOption = new Option(
  '--debug',
  'Debug output during command execution. If specified, may or may not produce additional output helpful for troubleshooting.'
);

export const curlirizeOption = new Option(
  '--curlirize',
  'Output all network calls in curl format.'
);

export const sourcesOptionM = new Option(
  '-c, --sources <sources>',
  'Comma separated list of log sources'
)
  .makeOptionMandatory()
  .default('am-everything,idm-everything', 'Log everything');

export const scriptFriendlyOption = new Option(
  '-s, --scriptFriendly',
  'Send output of operation to STDOUT in a script-friendly format (JSON) which can be piped to other \
commands. User messages/warnings are output to STDERR, and are not piped. For example, to only get \
bearer token: \n\
<<< frodo info my-tenant -s 2>/dev/null | jq -r .bearerToken >>>'
).default(false, 'Output as plain text');
