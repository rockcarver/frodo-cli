import { showAirGap } from '../../ops/AirGapOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings airgap show',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description('Show whether air-gapped mode is enabled and why.')
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show the effective state and its source:\n` +
        c.command(`  $ frodo settings airgap show\n`)
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      if (!showAirGap()) process.exitCode = 1;
    });

  return program;
}
