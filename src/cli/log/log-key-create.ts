import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { provisionCreds } from '../../ops/LogOps';
import { printError, printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { createLogApiKey } = frodo.cloud.log;
const { saveConnectionProfile } = frodo.conn;
const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo log key create',
    ['realm'],
    deploymentTypes
  );

  program
    .description('Create a new log API key and secret.')
    .addOption(
      new Option(
        '-n, --name <name>',
        "Name for the new key. Defaults to 'frodo-<username>' (auto-disambiguated with a timestamp suffix if that name is already taken), the same default frodo uses when auto-provisioning a key for a profile that has none yet."
      )
    )
    .addOption(
      new Option(
        '--save',
        'Save the new key and secret into the connection profile for this host after creation.'
      )
    )
    .addHelpText(
      'after',
      `Note: creating a log API key requires a full tenant admin credential -- a service account does not have sufficient privilege for this operation, so this command always logs in as a plain user regardless of any service account configured in the profile.`
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
        // Log API key creation is a super/tenant-admin-only operation
        // (confirmed live: a service account does not have sufficient
        // privilege) -- force a plain username/password login the same way
        // the existing auto-provision paths (log-list.ts's and
        // conn-save.ts's own "no log api key yet" fallback) already do,
        // rather than trying and failing with whatever credential a
        // service-account-configured profile would otherwise prefer.
        if (!(await getTokens(true, true, deploymentTypes))) {
          process.exitCode = 1;
          return;
        }
        verboseMessage('Creating log API key...');
        let creds;
        if (options.name) {
          try {
            creds = await createLogApiKey(options.name);
          } catch (error) {
            printError(error);
          }
        } else {
          // Reuses the exact default-naming + collision-disambiguation
          // logic the implicit auto-provision paths already rely on, so a
          // name picked here and one picked implicitly elsewhere can never
          // collide with each other by construction.
          creds = await provisionCreds();
        }
        if (!creds) {
          process.exitCode = 1;
          return;
        }
        printMessage(`Created log API key ${creds.api_key_id}`);
        printMessage(`Secret: ${creds.api_key_secret}`);

        if (options.save) {
          try {
            state.setLogApiKey(creds.api_key_id as string);
            state.setLogApiSecret(creds.api_key_secret as string);
            await saveConnectionProfile(host);
            printMessage(`Saved connection profile ${state.getHost()}`);
          } catch (error) {
            printMessage(
              `Error saving connection profile: ${error.message}`,
              'error'
            );
            process.exitCode = 1;
          }
        }
      }
      // end command logic inside action handler
    );

  return program;
}
