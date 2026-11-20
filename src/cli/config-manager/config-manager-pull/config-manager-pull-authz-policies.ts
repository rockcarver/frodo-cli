import { Option } from 'commander';
import { configManagerExportAuthzPolicySets } from '../../../configManagerOps/FrConfigAuthzPoliciesOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { refuseEmptySelector } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull authz-policies');

  program
    .description('Export authorization policies.')
    .addOption(
      new Option(
        '--config-file <file>',
        'A JSON file that lists the policy sets to pull for each realm. ex: "/Documents/policy-sets.json". Without it, every policy set of every realm is pulled. The realm argument narrows a pull without a file; with a file the realms of the file are pulled and the realm argument is not used.'
      ).argParser(refuseEmptySelector)
    )
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Without a config file, every policy set of every realm is pulled, or of the realm that is given. To pull only some of them, create a config file such as authz-policies.json and pass it with --config-file.\n' +
        `Example command: frodo config-manager pull authz-policies --config-file authz-policies.json -D policiesDir ${s.connId}\n\n` +
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
          : 'Exporting all policy sets.'
      );
      // With a file the realms of the file are pulled and the realm is not used;
      // without one, the realm narrows the pull (see configManagerExportAuthzPolicySets).
      const outcome = await configManagerExportAuthzPolicySets(
        options.configFile ?? null,
        options.allowFailures,
        realmOfRun(command, realm)
      );
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
