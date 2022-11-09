import { Argument, Option } from 'commander';
import { state } from '@rockcarver/frodo-lib';
import * as global from '../storage/StaticStorage.js';
import {
  printMessage,
  createProgressIndicator,
  updateProgressIndicator,
  stopProgressIndicator,
  verboseMessage,
  debugMessage,
  curlirizeMessage,
} from '../utils/Console.js';

state.default.session.setPrintHandler(printMessage);
state.default.session.setVerboseHandler(verboseMessage);
state.default.session.setDebugHandler(debugMessage);
state.default.session.setCurlirizeHandler(curlirizeMessage);
state.default.session.setCreateProgressHandler(createProgressIndicator);
state.default.session.setUpdateProgressHandler(updateProgressIndicator);
state.default.session.setStopProgressHandler(stopProgressIndicator);

export function init() {
  // pseudo functions for commands that do not otherwise need to import
  // this file but need to trigger print and progress handler registration
}

const hostArgumentDescription =
  'Access Management base URL, e.g.: https://cdk.iam.example.com/am. To use a connection profile, just specify a unique substring.';
export const hostArgument = new Argument('[host]', hostArgumentDescription);
export const hostArgumentM = new Argument('<host>', hostArgumentDescription);

const realmArgumentDescription =
  "Realm. Specify realm as '/' for the root realm or 'realm' or '/parent/child' otherwise.";
export const realmArgument = new Argument(
  '[realm]',
  realmArgumentDescription
).default(
  global.DEFAULT_REALM_KEY,
  '"alpha" for Identity Cloud tenants, "/" otherwise.'
);
export const realmArgumentM = new Argument('<realm>', realmArgumentDescription);

const userArgumentDescription =
  'Username to login with. Must be an admin user with appropriate rights to manage authentication journeys/trees.';
export const userArgument = new Argument('[user]', userArgumentDescription);
export const userArgumentM = new Argument('<user>', userArgumentDescription);

const passwordArgumentDescription = 'Password.';
export const passwordArgument = new Argument(
  '[password]',
  passwordArgumentDescription
);
export const passwordArgumentM = new Argument(
  '<password>',
  passwordArgumentDescription
);

const apiKeyArgumentDescription = 'API key for logging API.';
export const apiKeyArgument = new Argument('[key]', apiKeyArgumentDescription);

const apiSecretArgumentDescription = 'API secret for logging API.';
export const apiSecretArgument = new Argument(
  '[secret]',
  apiSecretArgumentDescription
);

const treeOptionDescription =
  'Specify the name of an authentication journey/tree.';
export const treeOption = new Option(
  '-t, --tree <tree>',
  treeOptionDescription
);
export const treeOptionM = new Option(
  '-t, --tree <tree>',
  treeOptionDescription
);

const fileOptionDescription = 'File name.';
export const fileOption = new Option(
  '-f, --file <file>',
  fileOptionDescription
);
export const fileOptionM = new Option(
  '-f, --file <file>',
  fileOptionDescription
);

const deploymentOptionDescription =
  'Override auto-detected deployment type. Valid values for type: \n\
classic:  A classic Access Management-only deployment with custom layout and configuration. \n\
cloud:    A ForgeRock Identity Cloud environment. \n\
forgeops: A ForgeOps CDK or CDM deployment. \n\
The detected or provided deployment type controls certain behavior like obtaining an Identity \
Management admin token or not and whether to export/import referenced email templates or how \
to walk through the tenant admin login flow of Identity Cloud and handle MFA';
export const deploymentOption = new Option(
  '-m, --type <type>',
  deploymentOptionDescription
).choices(global.DEPLOYMENT_TYPES);
export const deploymentOptionM = new Option(
  '-m, --type <type>',
  deploymentOptionDescription
).choices(global.DEPLOYMENT_TYPES);

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

export const managedNameOption = new Option(
  '-N, --name <name>',
  'Managed object name to be operated on. Examples are \
user, role, alpha_user, alpha_role etc.'
);
export const managedNameOptionM = new Option(
  '-N, --name <name>',
  'Managed object name to be operated on. Examples are \
user, role, alpha_user, alpha_role etc.'
);

const dirOptionDescription =
  'Directory for exporting all configuration entities to.';
export const dirOption = new Option(
  '-D, --directory <directory>',
  dirOptionDescription
);
export const dirOptionM = new Option(
  '-D, --directory <directory>',
  dirOptionDescription
);

const entitiesFileOptionDescription =
  'JSON file that specifies the config entities to export/import.';
export const entitiesFileOption = new Option(
  '-E, --entitiesFile <file>',
  entitiesFileOptionDescription
);
export const entitiesFileOptionM = new Option(
  '-E, --entitiesFile <file>',
  entitiesFileOptionDescription
);

const envFileOptionDescription =
  'File that defines environment specific variables for replacement during configuration export/import.';
export const envFileOption = new Option(
  '-e, --envFile <file>',
  envFileOptionDescription
);
export const envFileOptionM = new Option(
  '-e, --envFile <file>',
  envFileOptionDescription
);

const sourcesOptionDescription = 'Comma separated list of log sources';
const sourcesOptionDefaultValueDescription = 'Log everything';
export const sourcesOptionM = new Option(
  '-c, --sources <sources>',
  sourcesOptionDescription
).default('am-everything,idm-everything', sourcesOptionDefaultValueDescription);

export const scriptFriendlyOption = new Option(
  '-s, --scriptFriendly',
  'Send output of operation to STDOUT in a script-friendly format (JSON) which can be piped to other \
commands. User messages/warnings are output to STDERR, and are not piped. For example, to only get \
bearer token: \n\
<<< frodo info my-tenant -s 2>/dev/null | jq -r .bearerToken >>>'
).default(false, 'Output as plain text');

treeOptionM.makeOptionMandatory();
fileOptionM.makeOptionMandatory();
deploymentOptionM.makeOptionMandatory();
dirOptionM.makeOptionMandatory();
entitiesFileOptionM.makeOptionMandatory();
envFileOptionM.makeOptionMandatory();
managedNameOptionM.makeOptionMandatory();
sourcesOptionM.makeOptionMandatory();
