import c from '../../utils/ColorTheme';
import { FrodoStubCommand } from '../FrodoCommand';
import DisableCmd from './settings-update-check-disable';
import EnableCmd from './settings-update-check-enable';
import ShowCmd from './settings-update-check-show';

export default function setup() {
  const program = new FrodoStubCommand('update-check')
    .description(
      'Manage the automatic update check. Either the persisted setting or FRODO_NO_UPDATE_CHECK can disable it.'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show the effective state and its source:\n` +
        c.command(`  $ frodo settings update-check show\n`) +
        `  Disable automatic update checks:\n` +
        c.command(`  $ frodo settings update-check disable\n`) +
        `  Enable automatic update checks unless FRODO_NO_UPDATE_CHECK disables them:\n` +
        c.command(`  $ frodo settings update-check enable\n`)
    );

  program.addCommand(ShowCmd().name('show'));
  program.addCommand(EnableCmd().name('enable'));
  program.addCommand(DisableCmd().name('disable'));
  return program;
}
