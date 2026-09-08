import { errorMessage, successMessage } from '../../utils/Console';
import {
  activatePersistedTheme,
  listThemeDefinitions,
  setActiveThemeName,
} from '../../utils/ThemeConfig';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings theme set',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .description('Set the active color theme.')
    .argument('name', 'Name of the theme to activate.')
    .action(async (name, options, command) => {
      command.handleDefaultArgsAndOpts(name, options, command);
      const known = listThemeDefinitions().map((def) => def.name);
      if (!known.includes(name)) {
        errorMessage(
          `Unknown theme "${name}". Known themes: ${known.join(', ')}. Run "frodo settings theme list" to see them all.`
        );
        process.exitCode = 1;
        return;
      }
      setActiveThemeName(name);
      activatePersistedTheme();
      successMessage(`Theme set to "${name}".`);
    });

  return program;
}
