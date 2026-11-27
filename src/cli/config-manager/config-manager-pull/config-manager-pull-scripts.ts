import { configManagerExportScripts } from '../../../configManagerOps/FrConfigScriptOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand, ListOption } from '../../FrodoCommand';
import { refuseEmptySelector, selectorOption } from '../../SelectorOption';

export default function setup() {
  const program = new FrodoCommand('frodo config pull scripts');

  program
    .description('Export AM scripts.')
    .addOption(
      selectorOption(
        '-i, --script-id <id>',
        'Export the script with this id. Cannot be used with -n or -p.'
      ).conflicts(['scriptName', 'prefix'])
    )
    .addOption(
      selectorOption(
        '-n, --script-name <name>',
        'Export specific script using filename. Omit file extension. Cannot be used with -i or -p.'
      ).conflicts(['scriptId', 'prefix'])
    )
    // added because fr-config manager has a SCRIPT_PREFIXES=[] variable in its .env configuration file to specify scripts
    .addOption(
      new ListOption(
        '-p, --prefix <prefix>',
        'Export all scripts that start with a certain prefix. Repetition of this flag is allowed. An empty prefix is refused: it would match every script. Cannot be used with -i or -n.'
      )
        // an empty variable must not mean all scripts, as for a selector
        .argParser((value: string, previous: string[] = []) => [
          ...previous,
          refuseEmptySelector(value),
        ])
        .conflicts(['scriptId', 'scriptName'])
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
      const selected = options.scriptId ?? options.scriptName;
      verboseMessage(
        selected ? `Exporting script "${selected}".` : 'Exporting scripts'
      );
      const outcome = await configManagerExportScripts(
        options.prefix,
        realmOfRun(command, realm),
        options.scriptName,
        options.allowFailures,
        options.scriptId
      );
      if (!outcome) process.exitCode = 1;
    });
  return program;
}
