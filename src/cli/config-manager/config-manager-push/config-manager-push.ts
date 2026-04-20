import { FrodoStubCommand } from '../../FrodoCommand';
import AccessConfig from './config-manager-push-access-config';
import Audit from './config-manager-push-audit';
import Authentication from './config-manager-push-authentication';
import ConnectorDefinitions from './config-manager-push-connector-definitions';
import CookieDomains from './config-manager-push-cookie-domain';
import EmailProvider from './config-manager-push-email-provider';
import EmailTemplates from './config-manager-push-email-templates';
import Endpoints from './config-manager-push-endpoints';
import InternalRoles from './config-manager-push-internal-roles';
import Kba from './config-manager-push-kba';
import Locales from './config-manager-push-locales';
import ManagedObjects from './config-manager-push-managed-objects';
import OrgPrivileges from './config-manager-push-org-privileges';
import PasswordPolicy from './config-manager-push-password-policy';
import Schedules from './config-manager-push-schedules';
import ServiceObjects from './config-manager-push-service-objects';
import TermsAndConditions from './config-manager-push-terms-and-conditions';
import Themes from './config-manager-push-themes';
import UiConfig from './config-manager-push-ui-config';

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
  program.addCommand(EmailTemplates().name('email-templates'));
  program.addCommand(Schedules().name('schedules'));
  program.addCommand(OrgPrivileges().name('org-privileges'));
  program.addCommand(ManagedObjects().name('managed-objects'));
  program.addCommand(AccessConfig().name('access-config'));
  program.addCommand(Audit().name('audit'));
  program.addCommand(CookieDomains().name('cookie-domains'));
  program.addCommand(ServiceObjects().name('service-objects'));
  program.addCommand(UiConfig().name('ui-config'));
  program.addCommand(Authentication().name('authentication'));
  program.addCommand(ConnectorDefinitions().name('connector-definitions'));

  return program;
}
