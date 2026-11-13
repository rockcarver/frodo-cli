import { disableAirGap } from '../../ops/AirGapOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings airgap disable',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Persistently disable the air-gap setting. FRODO_AIRGAPPED can still enable air-gapped mode.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Disable air-gapped mode in the persisted setting (unless FRODO_AIRGAPPED enables it):\n` +
        c.command(`  $ frodo settings airgap disable\n`)
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      if (!disableAirGap()) process.exitCode = 1;
    });

  return program;
}
