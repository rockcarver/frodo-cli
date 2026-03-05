import { Option } from 'commander';

import { configManagerExportPasswordPolicy } from '../../../configManagerOps/FrConfigPasswordPolicyOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull password-policy',
    [],
    deploymentTypes
  );

  program
    .description('Export password-policy objects.')
    .addOption(
      new Option(
        '-r, --realm <realm>',
        'Specifies the realm to export from. Only the entity object from this realm will be exported.'
      )
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      if (options.realm) {
        realm = options.realm;
      }
      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Exporting config entity password-policy');
        const outcome = await configManagerExportPasswordPolicy(realm);
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
    });

  return program;
}
