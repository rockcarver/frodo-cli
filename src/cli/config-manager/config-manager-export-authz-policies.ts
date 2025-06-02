import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { exportAuthzPoliciesToFiles } from '../../configManagerOps/FrConfigAuthzPolicies';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager export authz-policies',
    deploymentTypes
  );

  program
    .description('Export authorization policies from realm.')
    .addOption(new Option('-p, --p-set <policy-set-id>', 'Get all the policies from a specific set. Ignored with -a.'))
    .addOption(new Option('-a, --all', 'Get all policies from all sets in all realms. If specified, -p and [realm] are ignored.'))
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (await getTokens(false, true, deploymentTypes)) {
        printMessage('Getting Authorization Policies');
        const outcome = await exportAuthzPoliciesToFiles(options.all, options.pSet);
        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
    }
  );

  return program;
}
