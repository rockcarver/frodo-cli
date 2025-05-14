import { frodo, state } from '@rockcarver/frodo-lib';

import { getTokens } from '../../ops/AuthenticateOps';
import { describeRealm } from '../../ops/RealmOps';
import { verboseMessage } from '../../utils/Console';
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
  const program = new FrodoCommand('frodo realm describe', [], deploymentTypes);

  program.description('Describe realms.').action(
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
        verboseMessage(`Retrieving details of realm ${state.getRealm()}...`);
        describeRealm(frodo.utils.getRealmName(state.getRealm()));
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

  return program;
}
