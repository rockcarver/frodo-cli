import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { configManagerExportTermsAndConditions } from '../../../configManagerOps/FrConfigTermsAndConditionsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull terms-and-conditions',
    [],
    deploymentTypes
  );

  program
    .description('Export terms and conditions.')
    .addOption(
      new Option(
        '-i, --version-id <version>',
        'Terms and conditions version, for example 0.1. If specified, the file holds only that version.'
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
        verboseMessage(
          options.versionId !== undefined
            ? `Exporting terms and conditions version "${options.versionId}"...`
            : 'Exporting terms and conditions...'
        );
        const outcome = await configManagerExportTermsAndConditions(
          options.versionId
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
