import c from '../../utils/ColorTheme';
import { FrodoStubCommand } from '../FrodoCommand';
import DisableCmd from './connector-disable.js';
import EnableCmd from './connector-enable.js';

export default function setup() {
  const program = new FrodoStubCommand('connector')
    .description('Manage IDM connectors.')
    .addHelpText(
      'after',
      c.warning(`\nImportant Note:\n`) +
        `  The connectors are the systems IDM synchronizes with. ${c.command('frodo connector')} is not ${c.command('frodo conn')}: that command manages the connection profiles frodo uses to log in to a tenant.\n\n`
    );

  program.addCommand(EnableCmd().name('enable'));

  program.addCommand(DisableCmd().name('disable'));

  return program;
}
