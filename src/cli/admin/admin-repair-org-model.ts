import { state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { repairOrgModel } from '../../ops/AdminOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const program = new FrodoCommand('frodo admin repair-org-model');

program
  .description('Repair org model.')
  .addOption(
    new Option(
      '--exclude-customized',
      'Exclude customized properties from repair.'
    )
  )
  .addOption(
    new Option(
      '--extend-permissions',
      'Extend permissions to include custom attributes.'
    )
  )
  .addOption(new Option('--dry-run', 'Dry-run only, do not perform changes.'))
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
        printMessage(`Repairing org model in realm "${state.getRealm()}"...`);
        const outcome = await repairOrgModel(
          options.excludeCustomized,
          options.extendPermissions,
          options.dryRun
        );
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
