import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo app describe', [], deploymentTypes);

  program
    .description('Describe application.')
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
      c.warning(`Important Note:\n`) +
        `  The ${c.command('frodo app')} command to manage OAuth2 clients in v1.x has been renamed to ${c.command('frodo oauth client')} in v2.x\n` +
        `  The ${c.command('frodo app')} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${c.command('frodo oauth client')} command.\n\n` +
        `Usage Examples:\n` +
        `  Describe application 'myApp':\n` +
        c.command(`  $ frodo app describe -i myApp ${s.connId}\n`) +
        `  Describe application 'myApp' in raw JSON:\n` +
        c.command(`  $ frodo app describe -i myApp --json ${s.connId}\n`)
    )
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
        if (await getTokens(false, true, deploymentTypes)) {
          // code goes here
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
