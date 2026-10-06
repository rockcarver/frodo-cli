import { FrodoStubCommand } from '../FrodoCommand';
import DescribeCmd from './feature-describe';
import InstallCmd from './feature-install';
import ListCmd from './feature-list';
import ValidateCmd from './feature-validate';
import { frodo } from '@rockcarver/frodo-lib';

export default function setup() {
  const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

  const program = new FrodoStubCommand('feature', [CLOUD_DEPLOYMENT_TYPE_KEY]);

  program.description(
    'Manage features (e.g. groups, aiagent, am/2fa/profiles).'
  );

  program.addCommand(ListCmd().name('list'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ValidateCmd().name('validate'));

  program.addCommand(InstallCmd().name('install'));

  return program;
}
