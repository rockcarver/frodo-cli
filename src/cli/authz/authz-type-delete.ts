import { FrodoCommand } from '../FrodoCommand';
import { Option } from 'commander';
import { frodo } from '@rockcarver/frodo-lib';
import { printMessage, verboseMessage } from '../../utils/Console.js';
import {
  deleteResourceType,
  deleteResourceTypeByName,
  deleteResourceTypes,
} from '../../ops/ResourceTypeOps';

const program = new FrodoCommand('frodo authz type delete');

program
  .description('Delete authorization resource types.')
  .addOption(
    new Option(
      '-i, --type-id <type-id>',
      'Variable id. If specified, -a is ignored.'
    )
  )
  .addOption(
    new Option(
      '-n, --type-name <type-name>',
      'Resource type name. If specified, -a is ignored.'
    )
  )
  .addOption(
    new Option(
      '-a, --all',
      'Delete all resource types in a realm. Ignored with -i and -n.'
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
      // delete by uuid
      if (options.typeId && (await frodo.login.getTokens())) {
        verboseMessage('Deleting authorization resource type...');
        const outcome = deleteResourceType(options.typeId);
        if (!outcome) process.exitCode = 1;
      }
      // delete by name
      else if (options.typeName && (await frodo.login.getTokens())) {
        verboseMessage('Deleting authorization resource type...');
        const outcome = deleteResourceTypeByName(options.typeName);
        if (!outcome) process.exitCode = 1;
      }
      // --all -a
      else if (options.all && (await frodo.login.getTokens())) {
        verboseMessage('Deleting all authorization resource types...');
        const outcome = deleteResourceTypes();
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        printMessage('Unrecognized combination of options or no options...');
        program.help();
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
