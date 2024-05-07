import { addAutoIdStaticUserMapping } from '../../ops/AdminOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo admin add-autoid-static-user-mapping'
  );

  program
    .description(
      'Add AutoId static user mapping to enable dashboards and other AutoId-based functionality.'
    )
    .action(
      // implement command logic inside action handler
      async (host, realm, user, password, options, command) => {
        command.handleDefaultArgsAndOpts(
          host,
          realm,
          user,
          password,
          options,
          command
        );
        if (await getTokens()) {
          printMessage(`Adding AutoId static user mapping...`);
          const outcome = await addAutoIdStaticUserMapping();
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
