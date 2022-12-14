import { Command, Option } from 'commander';
import {
  Authenticate,
  ConnectionProfile,
  ServiceAccount,
  state,
  constants,
} from '@rockcarver/frodo-lib';
import * as common from '../cmd_common.js';
import { verboseMessage, printMessage } from '../../utils/Console';
import { addExistingServiceAccount } from '../../ops/ConnectionProfileOps.js';

const { getTokens } = Authenticate;
const { saveConnectionProfile, addNewServiceAccount } = ConnectionProfile;
const { isServiceAccountsFeatureAvailable } = ServiceAccount;

const program = new Command('frodo conn save');

program
  .alias('add')
  .description('Save connection profiles.')
  .helpOption('-h, --help', 'Help')
  .showHelpAfterError()
  .addArgument(common.hostArgument)
  .addArgument(common.usernameArgument)
  .addArgument(common.passwordArgument)
  .addArgument(common.apiKeyArgument)
  .addArgument(common.apiSecretArgument)
  .addOption(common.deploymentOption)
  .addOption(common.insecureOption)
  .addOption(common.verboseOption)
  .addOption(common.debugOption)
  .addOption(common.curlirizeOption)
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
    async (host, user, password, key, secret, options) => {
      state.default.session.setTenant(host);
      state.default.session.setUsername(user);
      state.default.session.setPassword(password);
      state.default.session.setLogApiKey(key);
      state.default.session.setLogApiSecret(secret);
      state.default.session.setDeploymentType(options.type);
      state.default.session.setAllowInsecureConnection(options.insecure);
      state.default.session.setVerbose(options.verbose);
      state.default.session.setDebug(options.debug);
      state.default.session.setCurlirize(options.curlirize);
      if (options.authenticationService) {
        state.default.session.setAuthenticationService(
          options.authenticationService
        );
      }
      if (options.authenticationHeaderOverrides) {
        state.default.session.setAuthenticationHeaderOverrides(
          JSON.parse(options.authenticationHeaderOverrides)
        );
      }
      if ((options.validate && (await getTokens())) || !options.validate) {
        verboseMessage(
          `Saving connection profile for tenant ${state.default.session.getTenant()}...`
        );
        // if cloud deployment add service account
        if (
          options.validate &&
          state.default.session.getDeploymentType() ===
            constants.CLOUD_DEPLOYMENT_TYPE_KEY &&
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
          else if (!state.default.session.getServiceAccountId()) {
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
          printMessage(
            `Saved connection profile ${state.default.session.getTenant()}`
          );
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
