import { showUpdateCheck } from '../../ops/UpdateCheckOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings update-check show',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description('Show whether automatic update checks are enabled and why.')
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show the effective state and its source:\n` +
        c.command(`  $ frodo settings update-check show\n`)
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      if (!showUpdateCheck()) process.exitCode = 1;
    });

  return program;
}
