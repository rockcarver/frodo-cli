import c from '../../utils/ColorTheme';
import { createTable, printMessage } from '../../utils/Console';
import {
  getActiveThemeName,
  listThemeDefinitions,
} from '../../utils/ThemeConfig';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings theme list',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description('List available color themes.')
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      const active = getActiveThemeName();
      const table = createTable(['Name', 'Mode', 'Active', 'Description']);
      for (const def of listThemeDefinitions()) {
        table.push([
          def.name,
          def.mode,
          def.name === active ? c.positive('✔') : '',
          def.description,
        ]);
      }
      printMessage(table.toString(), 'data');
    });

  return program;
}
