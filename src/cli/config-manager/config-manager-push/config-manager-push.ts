import { FrodoStubCommand } from '../../FrodoCommand';
import Locales from './config-manager-push-locales';
import PasswordPolicy from './config-manager-push-password-policy';
import TermsAndConditions from './config-manager-push-terms-and-conditions';
import Themes from './config-manager-push-themes';

export default function setup() {
  const program = new FrodoStubCommand('push').description(
    'Import cloud configuration using fr-config-manager.'
  );

  program.addCommand(Themes().name('themes'));
  program.addCommand(TermsAndConditions().name('terms-and-conditions'));
  program.addCommand(PasswordPolicy().name('password-policy'));
  program.addCommand(Locales().name('locales'));
  return program;
}
