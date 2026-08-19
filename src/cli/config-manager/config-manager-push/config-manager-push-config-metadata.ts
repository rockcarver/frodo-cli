import { frodo } from '@rockcarver/frodo-lib';

import { configManagerImportMetadata } from '../../../configManagerOps/FrConfigMetadataOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand, ObjectOption } from '../../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push config-metadata',
    [],
    deploymentTypes
  );
  program
    .description('Import metadata.')
    .addOption(
      new ObjectOption(
        '-M, --metadata <value>',
        'Configuration metadata; set properties using dot notation, for example: -M.pushedAt $(date -u +"%Y-%m-%dT%H:%M:%SZ") -M.versionInfo.version 1.0 --metadata.versionInfo.stable'
      ).makeOptionMandatory()
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
      verboseMessage('Importing metadata.');
      const outcome = await configManagerImportMetadata(options.metadata);
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
