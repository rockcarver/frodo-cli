import { Option } from 'commander';
import c from '../../utils/ColorTheme';
import {
  errorMessage,
  printMessage,
  successMessage,
} from '../../utils/Console';
import {
  ConfigManagerApplicationLayout,
  getConfigManagerApplicationLayout,
  setConfigManagerApplicationLayout,
} from '../../utils/SettingsStore';
import { TREE_LAYOUT_MARKER_FILE } from '../../utils/TreeLayout';
import { FrodoCommand } from '../FrodoCommand';

function describeLayout(layout: ConfigManagerApplicationLayout): string {
  return layout === 'folders'
    ? 'one folder per application, holding the application and the objects it owns'
    : 'every object at the path of its own kind, the layout config-manager used before applications';
}

export default function setup() {
  const program = new FrodoCommand(
    'frodo settings config-manager-layout',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program
    .summary('Show or set the layout of a NEW config-manager tree.')
    .description(
      `Show or set the layout of a NEW config-manager tree. A tree records its own layout in ${TREE_LAYOUT_MARKER_FILE} at its root, and an existing tree keeps that layout: this setting is only read when a command creates a tree. "folders" keeps each application in its own folder together with the objects it owns; "kind-paths" keeps every object at the path of its own kind, as config-manager did before applications.`
    )
    .addOption(
      new Option(
        '--folders',
        'New trees get one folder per application (the default).'
      ).conflicts(['kindPaths'])
    )
    .addOption(
      new Option(
        '--kind-paths',
        'New trees keep every object at the path of its own kind, as before applications.'
      ).conflicts(['folders'])
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Show the layout that a new config-manager tree gets:\n` +
        c.command(`  $ frodo settings config-manager-layout\n`) +
        `  Make new config-manager trees keep one folder per application:\n` +
        c.command(`  $ frodo settings config-manager-layout --folders\n`) +
        `  Make new config-manager trees keep every object at the path of its own kind:\n` +
        c.command(`  $ frodo settings config-manager-layout --kind-paths\n`)
    )
    .action(async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      try {
        if (options.folders) {
          setConfigManagerApplicationLayout('folders');
          successMessage(
            'New config-manager trees will use the folders layout.'
          );
        } else if (options.kindPaths) {
          setConfigManagerApplicationLayout('kind-paths');
          successMessage(
            'New config-manager trees will use the kind-paths layout.'
          );
        }
        const layout = getConfigManagerApplicationLayout();
        printMessage(
          `A new config-manager tree gets the ${layout} layout: ${describeLayout(layout)}. An existing tree keeps the layout recorded in its ${TREE_LAYOUT_MARKER_FILE}.`
        );
      } catch (error) {
        errorMessage(`${error}`);
        process.exitCode = 1;
      }
    });

  return program;
}
