import { disableUpdateCheck } from '../../ops/UpdateCheckOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings update-check disable',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Persistently disable automatic update checks, without setting FRODO_NO_UPDATE_CHECK in every shell.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Disable automatic update checks in the persisted setting:\n` +
        c.command(`  $ frodo settings update-check disable\n`)
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      if (!disableUpdateCheck()) process.exitCode = 1;
    });

  return program;
}
