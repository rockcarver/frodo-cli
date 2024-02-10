import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import {
  describeResourceType,
  describeResourceTypeByName,
} from '../../ops/ResourceTypeOps';
import { verboseMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const program = new FrodoCommand('frodo authz type describe');

program
  .description('Describe authorization resource types.')
  .addOption(new Option('-i, --type-id <type-uuid>', 'Resource type uuid.'))
  .addOption(new Option('-n, --type-name <type-name>', 'Resource type name.'))
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
        verboseMessage(`Describing authorization resource type by uuid...`);
        const outcome = await describeResourceType(
          options.typeId,
          options.json
        );
        if (!outcome) process.exitCode = 1;
      } else if (options.typeName && (await getTokens())) {
        verboseMessage(`Describing authorization resource type by name...`);
        const outcome = await describeResourceTypeByName(
          options.typeName,
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
