import { frodo, state } from '@rockcarver/frodo-lib';

import { listOAuth2AdminClients } from '../../ops/AdminOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

const deploymentTypes = [
  CLOUD_DEPLOYMENT_TYPE_KEY,
  FORGEOPS_DEPLOYMENT_TYPE_KEY,
];

export default function setup() {
  const program = new FrodoCommand(
    'frodo admin list-oauth2-clients-with-admin-privileges',
    [],
    deploymentTypes
  );

  program.description('List oauth2 clients with admin privileges.').action(
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
        printMessage(
          `Listing oauth2 clients with admin privileges in realm "${state.getRealm()}"...`
        );
        const outcome = await listOAuth2AdminClients();
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

  return program;
}
