import { enableAirGap } from '../../ops/AirGapOps';
import c from '../../utils/ColorTheme';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings airgap enable',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description(
      'Persistently enable air-gapped mode: frodo then makes no request to a host you did not name (the update check and the application template catalog included). FRODO_AIRGAPPED can enable it too.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Enable air-gapped mode in the persisted setting:\n` +
        c.command(`  $ frodo settings airgap enable\n`)
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      if (!enableAirGap()) process.exitCode = 1;
    });

  return program;
}
