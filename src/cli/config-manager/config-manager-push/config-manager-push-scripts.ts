import { Option } from 'commander';
import { configManagerImportScripts } from '../../../configManagerOps/FrConfigScriptOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';
import { selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push scripts');

  program
    .description('Import scripts.')
    .addOption(
      selectorOption(
        '-i, --script-id <id>',
        'Script id, import only the specified script. Cannot be used with -n.'
      ).conflicts(['scriptName'])
    )
    .addOption(
      selectorOption(
        '-n, --script-name <name>',
        'Script name, import only the specified script. Cannot be used with -i.',
        ['--name']
      ).conflicts(['scriptId'])
    )
    .addOption(
      new Option(
        '--filenameFilter <filenameFilter>',
        'Filename Filter (combine multiples using comma, use ~ prefix on entry for wildcard match)'
      )
    );

  program.multiOp();

  program.usesRealm();

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
    if (!getTokensIsSuccessful) {
      process.exitCode = 1;
      return;
    }
    verboseMessage('Importing scripts');
    const outcome = await configManagerImportScripts(
      realmOfRun(command, realm),
      options.scriptName,
      options.filenameFilter,
      options.allowFailures,
      options.scriptId
    );
    if (!outcome) process.exitCode = 1;
  });

  return program;
}
