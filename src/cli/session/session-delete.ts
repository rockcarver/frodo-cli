import { deleteSession } from '../../ops/SessionOps';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo session delete',
    ['realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program.description('Delete the session(s) for a particular host.').action(
    // implement command logic inside action handler
    async (host, options, command) => {
      command.handleDefaultArgsAndOpts(host, options, command);
      await deleteSession(host);
    }
    // end command logic inside action handler
  );

  return program;
}
