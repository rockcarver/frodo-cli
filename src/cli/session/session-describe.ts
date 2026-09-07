import { describeSession } from '../../ops/SessionOps';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo session describe',
    ['realm', 'username', 'password', 'curlirize'],
    undefined,
    { local: true }
  );

  program.description('Describe the session(s) for a particular host.').action(
    // implement command logic inside action handler
    async (host, options, command) => {
      command.handleDefaultArgsAndOpts(host, options, command);
      await describeSession(host);
    }
    // end command logic inside action handler
  );

  return program;
}
