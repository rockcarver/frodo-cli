import { FrodoStubCommand } from '../FrodoCommand';
import WorkflowCmd from './workflow/iga-workflow';

export default function setup() {
  const program = new FrodoStubCommand('iga').description(
    'Manage IGA configuration.'
  );

  program.addCommand(WorkflowCmd().name('workflow').showHelpAfterError());

  program.showHelpAfterError();
  return program;
}
