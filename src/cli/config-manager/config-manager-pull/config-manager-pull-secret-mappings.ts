import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerExportSecretMappings } from '../../../configManagerOps/FrConfigSecretMappingsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull secret-mappings',
    [],
    deploymentTypes
  );

  program
    .description('Export secret mappings.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Name of the secret mapping, It will only export secret mapping with the name. Works both with mapping._id or alias.  '
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

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Exporting config entity secret-mappings');
        const outcome = await configManagerExportSecretMappings(
          options.name,
          realm
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
