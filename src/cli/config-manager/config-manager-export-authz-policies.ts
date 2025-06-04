import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  exportAllAuthzPolicies,
  exportAuthzPolicySet,
  exportRealmAuthzPolicySets,
} from '../../configManagerOps/FrConfigAuthzPoliciesOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const deploymentTypes = ['cloud'];
const { constants } = frodo.utils;

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager export authz-policies',
    deploymentTypes
  );

  program
    .description('Export authorization policies from realm.')
    .addOption(
      new Option(
        '-p, --p-set <policy-set-id>',
        'Get all the policies from a specific set.'
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
        let outcome: boolean;
        if (options.pSet) {
          printMessage(
            `Exporting all authorization policies from ${options.pSet} in the ${state.getRealm()} realm.`
          );
          outcome = !(await exportAuthzPolicySet({
            policySetName: options.pSet,
          }));
        } else if (realm !== constants.DEFAULT_REALM_KEY) {
          printMessage(
            `Exporting all authorization policies from all sets in the ${state.getRealm()} realm.`
          );
          exportRealmAuthzPolicySets();
        } else {
          printMessage('Exporting all authorization policies from tenant.');
          outcome = !(await exportAllAuthzPolicies());
        }

        if (!outcome) process.exitCode = 1;
      }

      // unrecognized combination of options or no options
      else {
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
