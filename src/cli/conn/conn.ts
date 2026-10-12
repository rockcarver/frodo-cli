import { errorMessage } from '../../utils/Console';
// The bare-invocation picker lives in the interactive layer (the
// framework is ambient: command files call INTO it, ops carries no
// prompting code -- see docs/INTERACTIVE-COMMANDS.md).
import { runInteractivePreferredCredentialPicker } from '../../utils/interactive/ConnectionProfilePickers';
import { FrodoStubCommand, hostArgument } from '../FrodoCommand';
import AliasCmd from './conn-alias.js';
import DeleteCmd from './conn-delete.js';
import DescribeCmd from './conn-describe.js';
import ListCmd from './conn-list.js';
import SaveCmd from './conn-save.js';
import ServiceAccountCmd from './conn-service-account.js';
import TestCmd from './conn-test.js';

export default function setup() {
  const program = new FrodoStubCommand('conn')
    .description('Manage connection profiles.')
    .addArgument(hostArgument);

  // A subcommand alongside `conn`'s own default action -- typing `frodo
  // conn save`/`describe`/etc. dispatches to the matching subcommand below
  // (commander matches subcommand names first), while bare `frodo conn` (or
  // `frodo conn <host>`, since hostArgument above is optional) falls
  // through to this action instead, launching the interactive
  // view/set-preferred-credential picker -- mirrors `frodo settings`'s own
  // bare-invocation pattern (see settings.ts). v1 scope only: viewing/
  // setting one already-existing profile's preferred credential, not full
  // profile browsing/creation/deletion.
  program.action(async (host) => {
    try {
      await runInteractivePreferredCredentialPicker(host);
    } catch (error) {
      errorMessage(`${error}`);
      process.exitCode = 1;
    }
  });

  program.addCommand(SaveCmd().name('save'));

  program.addCommand(AliasCmd().name('alias'));

  program.addCommand(DeleteCmd().name('delete'));

  program.addCommand(DescribeCmd().name('describe'));

  program.addCommand(ListCmd().name('list'));

  program.addCommand(ServiceAccountCmd().name('service-account'));

  program.addCommand(TestCmd().name('test'));

  return program;
}
