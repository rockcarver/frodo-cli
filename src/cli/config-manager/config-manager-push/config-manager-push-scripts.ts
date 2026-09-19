import { Option } from 'commander';

import { configManagerImportScripts } from '../../../configManagerOps/FrConfigScriptOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push scripts');

  program
    .description('Import scripts.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'Script name, import only the specified script'
      )
    )
    .addOption(
      new Option(
        '-f, --filenameFilter <filenameFilter>',
        'Filename Filter (combine multiples using comma, use ~ prefix on entry for wildcard match)'
      )
    );

  program.action(async (host, realm, user, password, options, command) => {
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
    verboseMessage('Importing scripts');
    const outcome = await configManagerImportScripts(
      realm,
      options.name,
      options.filenameFilter
    );
    if (!outcome) process.exitCode = 1;
  });

  return program;
}
