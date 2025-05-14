import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { getTokens } from '../../ops/AuthenticateOps';
import { deleteConfigEntityById } from '../../ops/IdmOps';
import { FrodoCommand } from '../FrodoCommand';

const {
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
} = frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
  IDM_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo idm delete', [], deploymentTypes);

  interface ServiceDeleteOptions {
    id?: string;
    type?: string;
    insecure?: boolean;
    verbose?: boolean;
    debug?: boolean;
    curlirize?: boolean;
    all?: boolean;
    global?: boolean;
  }

  program
    .description('Delete AM services.')
    .addOption(new Option('-i, --id <id>', 'Id of Service to be deleted.'))
    .action(
      async (
        host: string,
        realm: string,
        user: string,
        password: string,
        options: ServiceDeleteOptions,
        command
      ) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );

        // const globalConfig = options.global ?? false;

        if (options.id && (await getTokens(false, true, deploymentTypes))) {
          const outcome = await deleteConfigEntityById(options.id);
          if (!outcome) process.exitCode = 1;
        } else {
          program.help();
          process.exitCode = 1;
        }
      }
    );

  return program;
}
