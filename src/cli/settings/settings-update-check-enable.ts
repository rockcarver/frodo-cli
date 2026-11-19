import { enableUpdateCheck } from '../../ops/UpdateCheckOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings update-check enable',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Persistently enable automatic update checks. FRODO_NO_UPDATE_CHECK can still disable them.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Enable automatic update checks in the persisted setting:\n` +
        c.command(`  $ frodo settings update-check enable\n`)
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      if (!enableUpdateCheck()) process.exitCode = 1;
    });

  return program;
}
