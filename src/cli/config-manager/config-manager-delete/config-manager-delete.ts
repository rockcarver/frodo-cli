import Test from '../../conn/conn-test';
import { FrodoStubCommand } from '../../FrodoCommand';
import Applications from '../config-manager-delete/config-manager-delete-applications';
import CimdProfiles from '../config-manager-delete/config-manager-delete-cimd-profiles';
import EmailTemplates from '../config-manager-delete/config-manager-delete-email-templates';
import Endpoints from '../config-manager-delete/config-manager-delete-endpoints';
import Locales from '../config-manager-delete/config-manager-delete-locales';
import Themes from '../config-manager-delete/config-manager-delete-themes';
import CustomNodes from './config-manager-delete-custom-nodes';
import Scripts from './config-manager-delete-scripts';
import Secrets from './config-manager-delete-secrets';
import TermsConditions from './config-manager-delete-terms-and-conditions';
import Variables from './config-manager-delete-variables';

export default function setup() {
  const program = new FrodoStubCommand('delete').description(
    'Delete configuration optimized for CI/CD pipelines (format compatible with fr-config-manager).'
  );
  program.addCommand(Test().name('test'));
  program.addCommand(Applications().name('applications'));
  program.addCommand(CustomNodes().name('custom-nodes'));
  program.addCommand(Endpoints().name('endpoints'));
  program.addCommand(Scripts().name('scripts'));
  program.addCommand(Themes().name('themes'));
  program.addCommand(EmailTemplates().name('email-templates'));
  program.addCommand(Secrets().name('secrets'));
  program.addCommand(TermsConditions().name('terms-and-conditions'));
  program.addCommand(Variables().name('variables'));
  program.addCommand(Locales().name('locales'));
  program.addCommand(CimdProfiles().name('cimd-profiles'));
  return program;
}
