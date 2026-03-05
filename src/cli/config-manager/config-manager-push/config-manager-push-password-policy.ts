import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerImportPasswordPolicy } from '../../../configManagerOps/FrConfigPasswordPolicyOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push password-policy',
    [],
    deploymentTypes
  );

  program
    .description('Import password-policy objects.')
    .addOption(
      new Option(
        '-r, --realm <realm>',
        'Specifies the realm to Import from. Only the entity object from this realm will be imported.'
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
        verboseMessage('Importing config entity password-policy');
        const outcome = await configManagerImportPasswordPolicy(realm);
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
