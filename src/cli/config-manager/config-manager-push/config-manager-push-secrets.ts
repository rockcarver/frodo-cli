import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerImportSecrets } from '../../../configManagerOps/FrConfigSecretOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push secrets',
    [],
    deploymentTypes
  );

  program
    .description('Import secrets.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Secret name; import only the specified secret'
      )
    )

    .addOption(
      new Option(
        '-p, --prune',
        'Prunes old versions that are still enabled before importing the new version(s)'
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

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage('Importing secrets to cloud');
      const outcome = await configManagerImportSecrets(
        options.name,
        options.prune
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
