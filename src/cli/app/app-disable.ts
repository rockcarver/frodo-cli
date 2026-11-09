import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { disableApplication } from '../../ops/ApplicationOps';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo app disable', [], deploymentTypes);

  program
    .description('Disable an application (switch it off).')
    .addOption(
      new Option(
        '-i, --app-id <id>',
        'Application id. Cannot be used with -n.'
      ).conflicts(['appName'])
    )
    .addOption(
      new Option(
        '-n, --app-name <name>',
        'Application name. Cannot be used with -i.'
      ).conflicts(['appId'])
    )
    .addHelpText(
      'after',
      `Only a provisioning application, one with a connector, can be disabled: its status is the state of its connector (see the Status column of ${c.command('frodo app list -l')}).\n\n` +
        `Usage Examples:\n` +
        `  Disable the application '${s.applicationName}':\n` +
        c.command(
          `  $ frodo app disable -n ${s.applicationName} ${s.amBaseUrl}\n`
        ) +
        `  Disable it using a connection profile:\n` +
        c.command(`  $ frodo app disable -n ${s.applicationName} ${s.connId}\n`)
    )
    .requireOneOf({
      options: ['appId', 'appName'],
      purpose: 'which application to disable',
    })
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        // an unspecified -i/-n gets a picker from the framework after the
        // login (decision record 0038), so the login comes first
        if (await getTokens(false, true, deploymentTypes)) {
          verboseMessage('Disabling application...');
          const outcome = await disableApplication(
            options.appId,
            options.appName
          );
          if (!outcome) process.exitCode = 1;
        } else {
          // getTokens() failed, or the user declined the pick
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
