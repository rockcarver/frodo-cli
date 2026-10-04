import { Option } from 'commander';
import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { describeScriptBindings } from '../../ops/ScriptOps';
import c from '../../utils/ColorTheme';
import { printMessage, verboseMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo script type describe');

  program
    .description(
      'Describe the bindings (available objects/APIs, e.g. httpClient, idRepository) exposed to scripts running in a given scripting context.'
    )
    .addOption(
      new Option(
        '-c, --context <context>',
        'Scripting context id.'
      ).makeOptionMandatory()
    )
    .addOption(new Option('--json', 'Output in JSON format.'))
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Describe the bindings available to scripted decision node scripts:\n` +
        c.command(
          `  $ frodo script type describe -c SCRIPTED_DECISION_NODE ${s.amBaseUrl}\n`
        ) +
        `  Describe them in JSON format:\n` +
        c.command(
          `  $ frodo script type describe -c SCRIPTED_DECISION_NODE --json ${s.connId}\n`
        )
    )
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
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
            `Describing script bindings for context ${options.context}...`
          );
          const outcome = await describeScriptBindings(
            options.context,
            options.json
          );
          if (!outcome) process.exitCode = 1;
        } else {
          printMessage(
            'Unrecognized combination of options or no options...',
            'error'
          );
          process.exitCode = 1;
          program.help();
        }
      }
      // end command logic inside action handler
    );

  return program;
}
