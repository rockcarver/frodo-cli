import { Option } from 'commander';

import { configManagerExportSaml } from '../../../configManagerOps/FrConfigSamlOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull saml',
    [],
    deploymentTypes
  );

  program
    .description('Export saml.')
    .addOption(
      new Option('-f, --file <file>', 'The file path of the SAML config file. ')
    )
    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Make sure to create the export config file: saml.json to run this command.\n' +
        'Example command: frodo config-manager pull saml -f saml.json -D ../testDir frodo-dev\n\n' +
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
        '         "search": "https://idc.scheuber.io/am",\n' +
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
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      if (options.realm) {
        realm = options.realm;
      }

      if (await getTokens(false, true, deploymentTypes)) {
        verboseMessage('Exporting config entity saml');
        const outcome = await configManagerExportSaml(options.file);
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
