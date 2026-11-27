import { Option } from 'commander';
import { configManagerExportAuthzPolicySets } from '../../../configManagerOps/FrConfigAuthzPoliciesOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { refuseEmptySelector, selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config pull authz-policies');

  program
    .description('Export authorization policies.')
    .addOption(
      selectorOption(
        '-i, --policy-id <id>',
        'Policy id. If specified, pulls only that policy, the resource type it uses and the definition of its policy set. Needs a single realm (the realm argument). Cannot be used with --set-id or --config-file.'
      ).conflicts(['setId', 'configFile'])
    )
    .addOption(
      selectorOption(
        '--set-id <id>',
        'Policy set name. If specified, pulls only that policy set, its policies and the resource types they use. Needs a single realm (the realm argument). Cannot be used with -i or --config-file.'
      ).conflicts(['policyId', 'configFile'])
    )
    .addOption(
      new Option(
        '--config-file <file>',
        'A JSON file that lists the policy sets to pull for each realm. ex: "/Documents/policy-sets.json". Without it, every policy set of every realm is pulled. The realm argument narrows a pull without a file; with a file the realms of the file are pulled and the realm argument is not used. Cannot be used with -i or --set-id.'
      )
        .argParser(refuseEmptySelector)
        .conflicts(['policyId', 'setId'])
    )
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Without a config file, every policy set of every realm is pulled, or of the realm that is given. To pull one policy (-i) or one policy set (--set-id), name the realm too. To pull only some policy sets, create a config file such as authz-policies.json and pass it with --config-file.\n' +
        `Example command: frodo config pull authz-policies --config-file authz-policies.json -D policiesDir ${s.connId}\n\n` +
        `Config file example:\n` +
        '-----------------------  Example authz policies export config for authz-policies.json file ------------------------\n' +
        '{\n' +
        ' "/": ["oauth2Scopes"],\n' +
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
    .multiOp()
    .usesRealm()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) {
        process.exitCode = 1;
        return;
      }
      verboseMessage(
        options.configFile
          ? 'Exporting all policy sets in the provided config file.'
          : options.policyId
            ? `Exporting policy "${options.policyId}".`
            : options.setId
              ? `Exporting policy set "${options.setId}".`
              : 'Exporting all policy sets.'
      );
      // With a file the realms of the file are pulled and the realm is not used;
      // without one, the realm narrows the pull (see configManagerExportAuthzPolicySets).
      const outcome = await configManagerExportAuthzPolicySets(
        options.configFile ?? null,
        options.allowFailures,
        realmOfRun(command, realm),
        options.policyId,
        options.setId
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
