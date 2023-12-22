import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo app describe');

program
  .description('Describe application.')
  .addOption(new Option('-i, --app-id <id>', 'Application name.'))
  .addHelpText(
    'after',
    `Important Note:\n`['brightYellow'] +
      `  The ${'frodo app'['brightCyan']} command to manage OAuth2 clients in v1.x has been renamed to ${'frodo oauth client'['brightCyan']} in v2.x\n` +
      `  The ${'frodo app'['brightCyan']} command in v2.x manages the new applications created using the new application templates in ForgeRock Identity Cloud. To manage oauth clients, use the ${'frodo oauth client'['brightCyan']} command.\n\n` +
      `Usage Examples:\n` +
      `  Describe application 'myApp':\n` +
      `  $ frodo app describe -i myApp ${s.connId}\n`['brightCyan'] +
      `  Describe application 'myApp' in raw JSON:\n` +
      `  $ frodo app describe -i myApp --json ${s.connId}\n`['brightCyan']
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
      if (await getTokens()) {
        // code goes here
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
