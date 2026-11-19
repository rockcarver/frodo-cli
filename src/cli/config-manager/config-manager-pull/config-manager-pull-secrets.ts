import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerExportSecrets } from '../../../configManagerOps/FrConfigSecretOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

const deploymentTypes = [CLOUD_DEPLOYMENT_TYPE_KEY];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull secrets',
    [],
    deploymentTypes
  );

  program
    .description('Export secrets.')
    .addOption(
      selectorOption(
        '-i, --secret-id <id>',
        'Secret id. If specified, only exports the secret with the specified id (and reports only that secret with -r).'
      )
    )
    .addOption(
      new Option('-a, --active-only', 'Export only active secret versions.')
    )
    .addOption(new Option('-r, --report', 'Output secrets as a CSV report.'))
    .multiOp()
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
        verboseMessage(
          options.secretId !== undefined
            ? `Exporting secret "${options.secretId}"...`
            : 'Exporting secrets...'
        );
        const outcome = await configManagerExportSecrets(
          options.activeOnly,
          options.report,
          options.allowFailures,
          options.secretId
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
