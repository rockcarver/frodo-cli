import { FrodoStubCommand } from '../FrodoCommand';
import Scripts from './config-manager-export-scripts'
import Services from './config-manager-export-services';
import Mappings from './config-manager-export-mappings';
import Themes from './config-manager-export-themes';
import UiConfig from './config-manager-export-uiConfig';
import Variables from './config-manager-export-variables';

export default function setup() {
  const program = new FrodoStubCommand('config-manager export').description(
    'Export IDM configuration objects.'
  );

  program.addCommand(Scripts().name('scripts'));
  program.addCommand(Services().name('services'));
  program.addCommand(Mappings().name('mappings'));
  program.addCommand(Themes().name('themes'));
  program.addCommand(Variables().name('variables'));
  program.addCommand(UiConfig().name('ui-config'));

  return program;
}
