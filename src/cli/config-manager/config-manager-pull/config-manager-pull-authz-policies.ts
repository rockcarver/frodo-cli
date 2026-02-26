import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  configManagerExportAuthzPoliciesAll,
  configManagerExportAuthzPolicySet,
  configManagerExportAuthzPolicySets,
  configManagerExportAuthzPolicySetsRealm,
} from '../../../configManagerOps/FrConfigAuthzPoliciesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud'];
const { constants } = frodo.utils;
const { readRealms } = frodo.realm;

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull authz-policies',
    deploymentTypes
  );

  program
    .description('Export authorization policies from realm.')
    .addOption(
      new Option(
        '-r, --realm <realm>',
        'Specifies the realm to export from. Only policy sets from this realm will be exported. Ignored with -f'
      )
    )
    .addOption(
      new Option(
        '-n, --policy-name <policy-set-name>',
        'Get only a specific policy set with the name.'
      )
    )
    .addOption(
      new Option(
        '-f, --file <file>',
        'The AUTHZ_POLICY_SETS_CONFIG json file. ex: "/home/trivir/Documents/policy-sets.json", or "policy-sets.json"'
      )
    )
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Make sure to create the export config file: authz-policies.json to run this command.\n' +
        'Example command: frodo config-manager pull authz-policies -f authz-policies.json -D ../testDir frodo-dev\n\n' +
        `Config file example:\n` +
        '-----------------------  Example authz policies export config for authz-policies.json file ------------------------\n' +
        '{\n' +
        ' "alpha": [ \n' +
        '   "oauth2Scopes", \n' +
        '   "EdgePolicySet",\n' +
        '   "FeatureStorePolicySet",\n' +
        '   "data",\n' +
        '   "test-policy-set"\n' +
        ' ],\n' +
        ' "bravo": [\n' +
        '   "oauth2Scopes",\n' +
        '   "murphyTestPolicySet"\n' +
        '   ]\n' +
        '}\n' +
        '* -------------------------------------------------------------------------------------------- \n'
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

      // -r/--realm flag has precedence over [realm] arguement
      if (options.realm) {
        realm = options.realm;
      }

      if (await getTokens(false, true, deploymentTypes)) {
        let outcome: boolean;

        // -p/--p-set
        if (options.policyName) {
          printMessage(
            `Exporting the policy set "${options.policyName}" in the ${state.getRealm()} realm.`
          );

          // try and find script in current realm
          outcome = await configManagerExportAuthzPolicySet(
            {
              policySetName: options.policyName,
            },
            options.file
          );

          // check other realms for the script but only if there is no config file specified
          if (!outcome && !options.file) {
            const checkedRealms: string[] = [state.getRealm()];
            for (const realm of await readRealms()) {
              if (outcome) {
                break;
              }
              if (!checkedRealms.includes(realm.name)) {
                printMessage(
                  `Exporting the policy set "${options.policyName}" from the ${checkedRealms[checkedRealms.length - 1]} realm failed.`
                );
                state.setRealm(realm.name);
                checkedRealms.push(state.getRealm());
                printMessage(
                  `Looking for the policy set "${options.policyName}" in the ${state.getRealm()} realm now.`
                );
                outcome = await configManagerExportAuthzPolicySet(
                  {
                    policySetName: options.policyName,
                  },
                  null
                );
              }
            }
            if (!outcome) {
              printMessage(
                `Did not find the policy set "${options.policyName}" anywhere.`
              );
            }
          }
        }

        // -f/--file
        else if (options.file) {
          printMessage(
            `Exporting all the policy sets in the provided config file.`
          );
          outcome = await configManagerExportAuthzPolicySets(options.file);
        }

        // -r/--realm
        else if (realm !== constants.DEFAULT_REALM_KEY) {
          printMessage(
            `Exporting all the policy sets in the ${state.getRealm()} realm.`
          );
          outcome = await configManagerExportAuthzPolicySetsRealm();
        }

        // export all policy sets from all realms, the default when no options are provided
        else {
          printMessage('Exporting all the policy sets in the host tenant.');
          outcome = await configManagerExportAuthzPoliciesAll();
        }

        if (!outcome) {
          printMessage(
            `Failed to export one or more authorization policy sets. ${options.verbose ? '' : 'Check --verbose for me details.'}`
          );
          process.exitCode = 1;
        }
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
