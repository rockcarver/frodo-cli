import { FrodoStubCommand } from '../../FrodoCommand';
import EmailProvider from './config-manager-push-email-provider';
import Endpoints from './config-manager-push-endpoints';
import InternalRoles from './config-manager-push-internal-roles';
import Kba from './config-manager-push-kba';
import Locales from './config-manager-push-locales';
import PasswordPolicy from './config-manager-push-password-policy';
import TermsAndConditions from './config-manager-push-terms-and-conditions';
import Themes from './config-manager-push-themes';

export default function setup() {
  const program = new FrodoStubCommand('push').description(
    'Import configuration optimized for CI/CD pipelines (format compatible with fr-config-manager).'
  );

  program.addCommand(Themes().name('themes'));
  program.addCommand(TermsAndConditions().name('terms-and-conditions'));
  program.addCommand(PasswordPolicy().name('password-policy'));
  program.addCommand(Locales().name('locales'));
  program.addCommand(EmailProvider().name('email-provider'));
  program.addCommand(Endpoints().name('endpoints'));
  program.addCommand(Kba().name('kba'));
  program.addCommand(InternalRoles().name('internal-roles'));
  return program;
}
