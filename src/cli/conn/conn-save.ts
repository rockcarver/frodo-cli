import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { apiKeyArgument, apiSecretArgument } from './conn';
import {
  Authenticate,
  ConnectionProfile,
  ServiceAccount,
  state,
  constants,
} from '@rockcarver/frodo-lib';
import { verboseMessage, printMessage } from '../../utils/Console';
import { addExistingServiceAccount } from '../../ops/ConnectionProfileOps.js';

const { getTokens } = Authenticate;
const { saveConnectionProfile, addNewServiceAccount } = ConnectionProfile;
const { isServiceAccountsFeatureAvailable } = ServiceAccount;

const program = new FrodoCommand('frodo conn save', ['realm']);

program
  .alias('add')
  .description('Save connection profiles.')
  .addArgument(apiKeyArgument)
  .addArgument(apiSecretArgument)
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
  .addOption(new Option('--no-sa', 'Do not add service account.'))
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
    async (host, user, password, key, secret, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        user,
        password,
        key,
        secret,
        options,
        command
      );
      state.setLogApiKey(key);
      state.setLogApiSecret(secret);
      if (options.authenticationService) {
        state.setAuthenticationService(options.authenticationService);
      }
      if (options.authenticationHeaderOverrides) {
        state.setAuthenticationHeaderOverrides(
          JSON.parse(options.authenticationHeaderOverrides)
        );
      }
      if ((options.validate && (await getTokens())) || !options.validate) {
        verboseMessage(
          `Saving connection profile for tenant ${state.getTenant()}...`
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
        if (await saveConnectionProfile(host)) {
          printMessage(`Saved connection profile ${state.getTenant()}`);
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
