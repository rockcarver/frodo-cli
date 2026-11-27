import { frodo } from '@rockcarver/frodo-lib';
import { configManagerImportSecretMappings } from '../../../configManagerOps/FrConfigSecretMappingsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY, DEFAULT_REALM_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config push secretstore-mappings',
    [],
    deploymentTypes
  );

  program
    .description('Import secret mappings.')
    .addOption(
      selectorOption(
        '-i, --secret-mapping-id <id>',
        'Secret mapping id. It will only import the secret mapping with the specified id.',
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

      if (options.secretMappingId && (!realm || realm === DEFAULT_REALM_KEY)) {
        printMessage(
          'The -i, --secret-mapping-id option requires a realm argument to be specified.',
          'error'
        );
        process.exitCode = 1;
        program.help();
        return;
      }

      const getTokensIsSuccessful = await getTokens(
        false,
        true,
        deploymentTypes
      );
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Importing secret mappings configuration.');
      const outcome = await configManagerImportSecretMappings(
        options.secretMappingId,
        realmOfRun(command, realm),
        options.allowFailures
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
