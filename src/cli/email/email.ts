import { FrodoStubCommand } from '../FrodoCommand';
import TemplateCmd from './email-template';

export default function setup() {
  const program = new FrodoStubCommand('email').description(
    'Manage email templates and configuration.'
  );

  program.addCommand(TemplateCmd().name('template').showHelpAfterError());

  program.showHelpAfterError();
  return program;
}
