import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import {
  Authenticate,
  ConnectionProfile,
  ServiceAccount,
  state,
  constants,
} from '@rockcarver/frodo-lib';
import { verboseMessage, printMessage } from '../../utils/Console';
import { addExistingServiceAccount } from '../../ops/ConnectionProfileOps.js';
import { provisionCreds } from '../../ops/LogOps';

const { getTokens } = Authenticate;
const { saveConnectionProfile, addNewServiceAccount } = ConnectionProfile;
const { isServiceAccountsFeatureAvailable } = ServiceAccount;

const program = new FrodoCommand('frodo conn save', ['realm']);

program
  .alias('add')
  .description('Save connection profiles.')
  .addOption(
    new Option(
      '--sa-id <uuid>',
      "Service account's uuid. If specified, must also include --sa-jwk-file. Ignored with --no-sa."
    )
  )
  .addOption(
    new Option(
      '--sa-jwk-file <file>',
      "File containing the service account's java web key (jwk). Jwk must contain private key! If specified, must also include --sa-id. Ignored with --no-sa."
    )
  )
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
    new Option('--no-log-api', 'Do not create and add log API key and secret.')
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
  .action(
    // implement command logic inside action handler
    async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);
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
      const needSa =
        options.sa &&
        !state.getServiceAccountId() &&
        !state.getServiceAccountJwk();
      const needLogApiKey =
        options.logApi &&
        !state.getLogApiKey() &&
        !state.getLogApiSecret() &&
        needSa;
      const forceLoginAsUser = needSa || needLogApiKey;
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
          state.getDeploymentType() === constants.CLOUD_DEPLOYMENT_TYPE_KEY &&
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
              printMessage(error.response?.data, 'error');
              printMessage(
                `Error creating service account: ${error.response?.data?.message}`,
                'error'
              );
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
          state.getDeploymentType() === constants.CLOUD_DEPLOYMENT_TYPE_KEY &&
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
              state.setLogApiKey(creds.api_key_id);
              state.setLogApiSecret(creds.api_key_secret);
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
        if (await saveConnectionProfile(host)) {
          printMessage(`Saved connection profile ${state.getHost()}`);
        } else {
          process.exitCode = 1;
        }
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
