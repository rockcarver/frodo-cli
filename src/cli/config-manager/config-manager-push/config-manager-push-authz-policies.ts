import { configManagerImportAuthzPolicies } from '../../../configManagerOps/FrConfigAuthzPoliciesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push authz-policies');
  program.description('Import authorization policies.');

  program.action(async (host, realm, user, password, options, command) => {
    command.handleDefaultArgsAndOpts(
      host,
      realm,
      user,
      password,
      options,
      command
    );

    const getTokensIsSuccessful = await getTokens();
    if (!getTokensIsSuccessful) process.exit(1);
    printMessage(`Importing authorization policies...`);
    const outcome = await configManagerImportAuthzPolicies();
    if (!outcome) process.exitCode = 1;
  });

  return program;
}
