import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { deleteOauth2ClientById } from '../../ops/OAuth2ClientOps';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  CLASSIC_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo oauth client delete',
    [],
    deploymentTypes
  );

  program
    .description('Delete OAuth2 clients.')
    .addOption(
      new Option(
        '-i, --app-id <id>',
        'OAuth2 client id/name. If specified, -a and -A are ignored.'
      )
    )
    .addOption(
      new Option('-a, --all', 'Delete all cmds in a realm. Ignored with -i.')
    )
    .addOption(
      new Option(
        '--no-deep',
        'No deep delete. This leaves orphaned configuration artifacts behind.'
      )
    )
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        if (options.appId && (await getTokens(false, true, deploymentTypes))) {
          const outcome = deleteOauth2ClientById(options.appId);
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
