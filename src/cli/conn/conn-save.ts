import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { addExistingServiceAccount } from '../../ops/ConnectionProfileOps.js';
import { provisionCreds } from '../../ops/LogOps';
import { printError, printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const { isServiceAccountsFeatureAvailable } = frodo.cloud.serviceAccount;
const { addNewServiceAccount, saveConnectionProfile } = frodo.conn;

export default function setup() {
  const program = new FrodoCommand('frodo conn save', ['realm']);

  program
    .alias('add')
    .description('Save connection profiles.')
    .addOption(new Option('--no-sa', 'Do not create and add service account.'))
    .addOption(
      new Option(
        '--log-api-key [key]',
        'Log API key. If specified, must also include --log-api-secret. Ignored with --no-log-api.'
      )
    )
    .addOption(
      new Option(
        '--log-api-secret [secret]',
        'Log API secret. If specified, must also include --log-api-key. Ignored with --no-log-api.'
      )
    )
    .addOption(
      new Option(
        '--no-log-api',
        'Do not create and add log API key and secret.'
      )
    )
    .addOption(new Option('--no-validate', 'Do not validate connection.'))
    .addOption(
      new Option(
        '--authentication-service [service]',
        'Name of the authentication service/tree to use.'
      )
    )
    .addOption(
      new Option(
        '--authentication-header-overrides [headers]',
        'Map of headers: {"host":"am.example.com:8081"}.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Create a connection profile with a new log API key and secret and a new service account:\n` +
        `  $ frodo conn save ${s.amBaseUrl} ${s.username} '${s.password}'\n`[
          'brightCyan'
        ] +
        `  Create a connection profile using Amster private key credentials (PingAM classic deployments only):\n` +
        `  $ frodo conn save --private-key ${s.amsterPrivateKey} ${s.amClassicBaseUrl}\n`[
          'brightCyan'
        ] +
        `  Save an existing service account to an existing or new connection profile:\n` +
        `  $ frodo conn save --sa-id ${s.saId} --sa-jwk-file ${s.saJwkFile} ${s.amBaseUrl}\n`[
          'brightCyan'
        ] +
        `  Save an existing service account to an existing connection profile (partial host URL only updates an existing profile):\n` +
        `  $ frodo conn save --sa-id ${s.saId} --sa-jwk-file ${s.saJwkFile} ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Save a connection profile for a Proxy Connect-protected PingOne Advanced Identity Cloud environment:\n` +
        `  $ frodo conn save --authentication-header-overrides '{"MY-SECRET-HEADER": "proxyconnect secret header value"}' ${s.amBaseUrl} ${s.username} '${s.password}'\n`[
          'brightCyan'
        ] +
        `  Update an existing connection profile with a custom header override for a freshly Proxy Connect-protected PingOne Advanced Identity Cloud environment:\n` +
        `  $ frodo conn save --authentication-header-overrides '{"MY-SECRET-HEADER": "proxyconnect secret header value"}' ${s.connId}\n`[
          'brightCyan'
        ] +
        `  Update an existing connection profile to use Amster private key credentials with a custom Amster journey (PingAM classic deployments only):\n` +
        `  $ frodo conn save --private-key ${s.amsterPrivateKey} --authentication-service ${s.customAmsterService} ${s.classicConnId}\n`[
          'brightCyan'
        ]
    )
    .action(
      // implement command logic inside action handler
      async (host, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          user,
          password,
          options,
          command
        );
        state.setLogApiKey(options.logApiKey);
        state.setLogApiSecret(options.logApiSecret);
        if (options.authenticationService) {
          state.setAuthenticationService(options.authenticationService);
        }
        if (options.authenticationHeaderOverrides) {
          state.setAuthenticationHeaderOverrides(
            JSON.parse(options.authenticationHeaderOverrides)
          );
        }
        const needAmsterLogin = !!options.privateKey;
        const needSa =
          options.sa &&
          !state.getServiceAccountId() &&
          !state.getServiceAccountJwk();
        const needLogApiKey =
          options.logApi &&
          !state.getLogApiKey() &&
          !state.getLogApiSecret() &&
          needSa;
        const forceLoginAsUser = !needAmsterLogin && (needSa || needLogApiKey);
        if (
          (options.validate && (await getTokens(forceLoginAsUser))) ||
          !options.validate
        ) {
          verboseMessage(
            `Saving connection profile for tenant ${state.getHost()}...`
          );
          // if cloud deployment add service account
          if (
            options.validate &&
            state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY &&
            options.sa &&
            (await isServiceAccountsFeatureAvailable())
          ) {
            // validate and add existing service account
            if (options.saId && options.saJwkFile) {
              verboseMessage(`Validating and adding service account...`);
              if (
                await addExistingServiceAccount(
                  options.saId,
                  options.saJwkFile,
                  options.validate
                )
              ) {
                printMessage(
                  `Validated and added service account with id ${options.saId} to profile.`
                );
              }
            }
            // add new service account if none already exists in the profile
            else if (!state.getServiceAccountId()) {
              try {
                verboseMessage(`Creating service account...`);
                const sa = await addNewServiceAccount();
                printMessage(
                  `Created and added service account ${sa.name} with id ${sa._id} to profile.`
                );
              } catch (error) {
                printError(error);
                process.exitCode = 1;
              }
            }
          }
          // add existing service account without validation
          else if (
            !options.validate &&
            options.saId &&
            options.saJwkFile &&
            options.sa
          ) {
            addExistingServiceAccount(
              options.saId,
              options.saJwkFile,
              options.validate
            );
          }
          // if cloud deployment add log api key and secret
          verboseMessage(options);
          verboseMessage(state);
          if (
            options.validate &&
            state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY &&
            needLogApiKey
          ) {
            // validate and add existing log api key and secret
            if (options.logApiKey && options.logApiSecret) {
              verboseMessage(`Validating and adding log api key and secret...`);
              if (
                await addExistingServiceAccount(
                  options.logApiKey,
                  options.logApiSecret,
                  options.validate
                )
              ) {
                printMessage(
                  `Added log API key ${options.logApiKey} to profile.`
                );
              }
            }
            // add new log api key and secret if none already exists in the profile
            else if (!state.getLogApiKey()) {
              try {
                const creds = await provisionCreds();
                state.setLogApiKey(creds.api_key_id as string);
                state.setLogApiSecret(creds.api_key_secret as string);
                printMessage(
                  `Created log API key ${creds.api_key_id} and secret.`
                );
              } catch (error) {
                printMessage(error.response?.data, 'error');
                printMessage(
                  `Error creating log API key and secret: ${error.response?.data?.message}`,
                  'error'
                );
                process.exitCode = 1;
              }
            }
          }
          // add existing log api key and secret without validation
          // storing log API key and secret in the connection profile is happening default, therefore no code required here
          try {
            await saveConnectionProfile(host);
            printMessage(`Saved connection profile ${state.getHost()}`);
          } catch (error) {
            printError(error);
            process.exitCode = 1;
          }
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
