import { Option } from 'commander';

import { configManagerExportServiceObjectsFromFile } from '../../../configManagerOps/FrConfigServiceObjectsOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud', 'forgeops'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull service-objects',
    [],
    deploymentTypes
  );

  program
    .description('Export service objects.')
    .addOption(
      new Option(
        '-f, --file <file>',
        'The file path of the service object config file. '
      )
    )
    // To do: export all users/roles

    .addHelpText(
      'after',
      'HELP MESSAGE:\n' +
        'Make sure to create the export config file: service-objects.json to run this command.\n' +
        'Example command: frodo config-manager pull service-objects -f service-objects.json -D ../testDir frodo-dev\n\n' +
        `Config file example:\n` +
        '------------  Example service object export config for service-objects.json file -----------\n' +
        '{\n' +
        ' "alpha_user": [\n' +
        '   {\n' +
        '     "searchField": "userName",\n' +
        '     "searchValue": "kirk",\n' +
        '     "fields": ["userName", "givenName", "sn", "mail", "authzRoles"],\n' +
        '     "overrides": {\n' +
        '       "password": "${SERVICE_ACCOUNT_JOURNEY_PASSWORD}"\n' +
        '     }\n' +
        '   },\n' +
        '   {\n' +
        '     "searchField": "sn",\n' +
        '     "searchValue": "SeanTest",\n' +
        '     "fields": ["userName", "givenName", "sn", "mail", "authzRoles"],\n' +
        '     "overrides": {\n' +
        '       "userName": "seantest",\n' +
        '       "givenName": "sean",\n' +
        '         "password": "${SERVICE_ACCOUNT_JOURNEY_PASSWORD}"\n' +
        '     }\n' +
        '   }\n' +
        ' ],\n' +
        ' "alpha_role": [\n' +
        '  {\n' +
        '    "searchField": "name",\n' +
        '    "searchValue": "TestRole",\n' +
        '    "fields": ["name", "description"],\n' +
        '    "overrides": {}\n' +
        '  }\n' +
        ' ],\n' +
        ' "bravo_user": [\n' +
        '  {\n' +
        '    "searchField": "userName",\n' +
        '    "searchValue": "bravo_test_user",\n' +
        '    "fields": ["userName", "givenName", "sn", "mail", "authzRoles"],\n' +
        '    "overrides": {\n' +
        '    }\n' +
        '  }\n' +
        ' ]\n' +
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

      if (options.file && (await getTokens(false, true, deploymentTypes))) {
        verboseMessage('Exporting service objects');
        const outcome = await configManagerExportServiceObjectsFromFile(
          options.file
        );
        if (!outcome) process.exitCode = 1;
      } else {
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
