import { Option } from 'commander';
import { configManagerExportSaml } from '../../../configManagerOps/FrConfigSamlOps';
import * as s from '../../../help/SampleData';
import { ownedObjectsHelp } from '../../../ops/ApplicationOwnedObjectsHelp';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { refuseEmptySelector, selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull saml');

  program
    .description('Export saml.')
    .addOption(
      selectorOption(
        '-i, --entity-id <id>',
        'SAML provider entity id. If specified, pulls only that provider. Needs a single realm (the realm argument). Cannot be used with --cot-id or --config-file.'
      ).conflicts(['cotId', 'configFile'])
    )
    .addOption(
      selectorOption(
        '--cot-id <id>',
        'Circle of trust id. If specified, pulls only that circle of trust. Needs a single realm (the realm argument). Cannot be used with -i or --config-file.'
      ).conflicts(['entityId', 'configFile'])
    )
    .addOption(
      new Option(
        '--config-file <file>',
        'A JSON file that lists the SAML providers and circles of trust to pull, with replacements. Without it, every provider and every circle of trust of every realm is pulled. The realm argument narrows a pull without a file; with a file the realms of the file are pulled and the realm argument is not used. Cannot be used with -i or --cot-id.'
      )
        .argParser(refuseEmptySelector)
        .conflicts(['entityId', 'cotId'])
    )
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Without a config file, every SAML provider and every circle of trust of every realm is pulled, or of the realm that is given. To pull one provider (-i) or one circle of trust (--cot-id), name the realm too. To pull only some of them, or to replace values, create a config file such as saml.json and pass it with --config-file.\n' +
        `Example command: frodo config-manager pull saml --config-file saml.json -D ../testDir ${s.connId}\n\n` +
        `Config file example:\n` +
        '-----------------------  Example SAML export config for saml.json file ------------------------\n' +
        '{\n' +
        ' "alpha": {\n' +
        '   "samlProviders": [\n' +
        '     {\n' +
        '       "entityId": "urn:federation:MicrosoftOnline",\n' +
        '       "fileName": "microsoftOnline"\n' +
        '     },\n' +
        '     {\n' +
        '       "entityId": "iSPAzure",\n' +
        '       "replacements": [\n' +
        '         {\n' +
        `         "search": "${s.amBaseUrl}",\n` +
        '         "replacement": "${TENANT_BASE_URL}"\n' +
        '         }\n' +
        '       ]\n' +
        '     }\n' +
        '   ],\n' +
        '   "circlesOfTrust": ["AzureCOT", "affiliation-test"]\n' +
        ' }\n' +
        '}\n' +
        '* -------------------------------------------------------------------------------------------- \n'
    )
    .addHelpText('after', ownedObjectsHelp('SAML providers'))
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

      if (await getTokens()) {
        verboseMessage(
          options.entityId
            ? `Exporting SAML provider "${options.entityId}".`
            : options.cotId
              ? `Exporting circle of trust "${options.cotId}".`
              : 'Exporting config entity saml'
        );
        // With a file the realms of the file are pulled and the realm is not used;
        // without one, the realm narrows the pull (see configManagerExportSaml).
        const outcome = await configManagerExportSaml(
          options.configFile ?? null,
          options.allowFailures,
          undefined,
          realmOfRun(command, realm),
          options.entityId,
          options.cotId
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
