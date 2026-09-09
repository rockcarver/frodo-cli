import { Option } from 'commander';

import { configManagerExportScripts } from '../../../configManagerOps/FrConfigScriptOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand, ListOption } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull scripts');

  program
    .description('Export AM scripts.')
    .addOption(
      new Option(
        '-n, --script-name <script name>',
        'Export specific script using filename. Omit file extension.'
      )
    )
    // added because fr-config manager has a SCRIPT_PREFIXES=[] variable in its .env configuration file to specify scripts
    .addOption(
      new ListOption(
        '-p, --prefix <prefix>',
        'Export all scripts that start with a certain prefix. Repetition of this flag is allowed. Ignored with -n'
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

      const getTokensIsSuccessful = await getTokens();
      if (!getTokensIsSuccessful) process.exit(1);
      verboseMessage(
        options.scriptName
          ? `Exporting script "${options.scriptName}".`
          : 'Exporting scripts'
      );
      const outcome = await configManagerExportScripts(
        options.prefix,
        realm,
        options.scriptName
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
