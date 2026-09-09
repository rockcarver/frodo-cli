import { Option } from 'commander';

import { configManagerExportAuthzPolicySets } from '../../../configManagerOps/FrConfigAuthzPoliciesOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull authz-policies');

  program
    .description('Export authorization policies.')
    .addOption(
      new Option(
        '-f, --file <file>',
        '*Required* The AUTHZ_POLICY_SETS_CONFIG json file. ex: "/Documents/policy-sets.json"'
      ).makeOptionMandatory()
    )
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Make sure to create the export config file, e.g. authz-policies.json, to run this command.\n' +
        'Example command: frodo config-manager pull authz-policies -f authz-policies.json -D policiesDir frodo-dev\n\n' +
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
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage('Exporting all policy sets in the provided config file.');
      const outcome = await configManagerExportAuthzPolicySets(options.file);
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
