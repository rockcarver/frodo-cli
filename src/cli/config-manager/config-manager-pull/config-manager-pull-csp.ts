import { Option } from 'commander';

import { configManagerExportCsp } from '../../../configManagerOps/FrConfigCspOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage, verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud'];

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull cps',
    [],
    deploymentTypes
  );

  program
    .description('Export content security policy.')
    .addOption(
      new Option(
        '-f, --file <file>',
        'The CSP_OVERRIDES json file. ex: "/home/trivir/Documents/csp-overrides.json", or "csp-overrides.json"'
      )
    )
    .addHelpText(
      'after',
      'There is an option to overrides the export file.\n' +
        '-----------------------  Example CSP_OVERRIDES json file ---------------------------------- \n' +
        '{\n' +
        ' "enforced": {\n' +
        '   "active": {\n' +
        '     "$bool": "${CSP_ENFORCED}"\n' +
        '   }\n' +
        ' },\n' +
        ' "report-only": {\n' +
        '"active": {\n' +
        '"$bool": "${CSP_REPORT_ONLY}"\n' +
        '}\n' +
        ' }\n' +
        '}\n'
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
        verboseMessage('Exporting content security policy');
        const outcome = await configManagerExportCsp(options.file);
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
