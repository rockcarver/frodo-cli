import { FrodoStubCommand } from '../FrodoCommand';
import AuthzPolicies from './config-manager-export-authz-policies';
import Mappings from './config-manager-export-mappings';
import Scripts from './config-manager-export-scripts';
import Secrets from './config-manager-export-secrets';
import Services from './config-manager-export-services';
import Terms from './config-manager-export-terms-and-conditions';
import Themes from './config-manager-export-themes';
import UiConfig from './config-manager-export-uiConfig';
import Variables from './config-manager-export-variables';

export default function setup() {
  const program = new FrodoStubCommand('config-manager export').description(
    'Export IDM configuration objects.'
  );

  program.addCommand(Secrets().name('secrets'));
  program.addCommand(Scripts().name('scripts'));
  program.addCommand(Services().name('services'));
  program.addCommand(Mappings().name('mappings'));
  program.addCommand(Themes().name('themes'));
  program.addCommand(Variables().name('variables'));
  program.addCommand(Terms().name('terms-and-conditions'));
  program.addCommand(UiConfig().name('ui-config'));
  program.addCommand(AuthzPolicies().name('authz-policies'));

  return program;
}
