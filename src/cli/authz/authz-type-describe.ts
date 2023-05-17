import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { Authenticate } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console.js';
import { describeResourceType } from '../../ops/ResourceTypeOps';

const { getTokens } = Authenticate;

const program = new FrodoCommand('frodo authz type describe');

program
  .description('Describe authorization resource types.')
  .addOption(
    new Option(
      '-i, --type-id <type-id>',
      'Resource type id.'
    ).makeOptionMandatory()
  )
  .addOption(new Option('--json', 'Output in JSON format.'))
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
      if (options.typeId && (await getTokens())) {
        verboseMessage(
          `Describing authorization resource type ${options.typeId}...`
        );
        const outcome = await describeResourceType(
          options.typeId,
          options.json
        );
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        verboseMessage('Unrecognized combination of options or no options...');
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
