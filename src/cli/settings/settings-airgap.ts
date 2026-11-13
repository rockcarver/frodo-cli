import c from '../../utils/ColorTheme';
import { FrodoStubCommand } from '../FrodoCommand';
import DisableCmd from './settings-airgap-disable';
import EnableCmd from './settings-airgap-enable';
import ShowCmd from './settings-airgap-show';

export default function setup() {
  const program = new FrodoStubCommand('airgap')
    .summary('Manage air-gapped mode (no request to a host you did not name).')
    .description(
      'Manage air-gapped mode. While it is on, frodo makes no request to a host you did not name: the update check and the application template catalog are not made. The tenant and the hosts and URLs you give stay allowed. Either the persisted setting or FRODO_AIRGAPPED switches it on.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show the effective state and its source:\n` +
        c.command(`  $ frodo settings airgap show\n`) +
        `  Enable air-gapped mode:\n` +
        c.command(`  $ frodo settings airgap enable\n`) +
        `  Disable the air-gap setting (FRODO_AIRGAPPED can still enable it):\n` +
        c.command(`  $ frodo settings airgap disable\n`)
    );

  program.addCommand(ShowCmd().name('show'));
  program.addCommand(EnableCmd().name('enable'));
  program.addCommand(DisableCmd().name('disable'));
  return program;
}
