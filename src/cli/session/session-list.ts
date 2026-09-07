import { listSessions } from '../../ops/SessionOps';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo session list',
    ['host', 'realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program.description('List authenticated sessions across all hosts.').action(
    // implement command logic inside action handler
    async (options, command) => {
      command.handleDefaultArgsAndOpts(options, command);
      listSessions();
    }
    // end command logic inside action handler
  );

  return program;
}
