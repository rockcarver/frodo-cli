import { FrodoStubCommand } from '../FrodoCommand';
import UiConfig from './config-manager-export-uiConfig';
import Variables from './config-manager-export-variables';

export default function setup() {
  const program = new FrodoStubCommand('config-manager export').description(
    'Export IDM configuration objects.'
  );

  program.addCommand(Variables().name('variables'));
  program.addCommand(UiConfig().name('ui-config'));

  return program;
}
