import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerExportSecretMappings } from '../../../configManagerOps/FrConfigSecretMappingsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { withOptionAlias } from '../../OptionAlias';

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
      withOptionAlias(
        new Option(
          '-i, --secret-mapping-id <id>',
          'Id of the secret mapping. If specified, only exports the secret mapping with the specified id.'
        ),
        ['-n', '--name']
      )
    )
    .multiOp()
    .usesRealm()
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
        verboseMessage('Exporting secret mappings...');
        const outcome = await configManagerExportSecretMappings(
          options.secretMappingId,
          realmOfRun(command, realm),
          options.allowFailures
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
