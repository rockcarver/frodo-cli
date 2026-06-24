import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { configManagerImportSaml } from '../../../configManagerOps/FrConfigSamlOps';
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
    'frodo config-manager push saml',
    [],
    deploymentTypes
  );
  program
    .description('Import saml configuration.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'The entityId (or COT _id) of a single SAML entity to import.'
      )
    )
    .addOption(
      new Option(
        '-e, --env <value>',
        'Value to use for the placeholder when importing a single named entity (requires --name). Overrides .env files and environment variables.'
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
        verboseMessage('Importing saml configuration');
        const outcome = await configManagerImportSaml(
          options.name,
          options.env
        );
        if (!outcome) process.exitCode = 1;
      } else {
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