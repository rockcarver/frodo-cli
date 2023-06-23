import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';

const { getTokens } = frodo.login;

const program = new FrodoCommand('frodo log key describe');

program
  .description('Describe log API keys.')
  .addOption(
    new Option(
      '-i, --key-id <key-id>',
      'Key id. If specified, -a and -A are ignored.'
    )
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
