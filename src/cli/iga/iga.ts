import { FrodoStubCommand } from '../FrodoCommand';
import WorkflowCmd from './workflow/iga-workflow';
import { frodo } from '@rockcarver/frodo-lib';

export default function setup() {
  const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

  const program = new FrodoStubCommand('iga', [CLOUD_DEPLOYMENT_TYPE_KEY]).description(
    'Manage IGA configuration.'
  );

  program.addCommand(WorkflowCmd().name('workflow').showHelpAfterError());

  program.showHelpAfterError();
  return program;
}
