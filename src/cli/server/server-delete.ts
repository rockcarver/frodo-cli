import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { getTokens } from '../../ops/AuthenticateOps';
import { FrodoCommand } from '../FrodoCommand';

const { CLASSIC_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLASSIC_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand('frodo server delete', [], deploymentTypes);

  program
    .description('Delete servers.')
    .addOption(
      new Option(
        '-i, --server-id <server-id>',
        'Server id. Cannot be used with -u or -a.'
      ).conflicts(['serverUrl', 'all'])
    )
    .addOption(
      new Option(
        '-u, --server-url <server-url>',
        'Server url. Can be a unique substring of the full url (if not unique, it will error out). Cannot be used with -i or -a.'
      ).conflicts(['serverId', 'all'])
    )
    .addOption(
      new Option(
        '-a, --all',
        'Delete all servers. Cannot be used with -i or -u.'
      ).conflicts(['serverId', 'serverUrl'])
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
        if (await getTokens(false, true, deploymentTypes)) {
          // code goes here
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
