<<<<<<< HEAD
import { FrodoCommand } from '../FrodoCommand';
import { Authenticate } from '@rockcarver/frodo-lib';
import { verboseMessage } from '../../utils/Console';
import { listAdminFederationProviders } from '../../ops/AdminFederationOps';

const { getTokens } = Authenticate;

=======
import { frodo } from '@rockcarver/frodo-lib';
import { FrodoCommand } from '../FrodoCommand';
import { verboseMessage } from '../../utils/Console';
import { listAdminFederationProviders } from '../../ops/AdminFederationOps';

>>>>>>> 4d75d27... update to frodo-lib 2.0.0-8 and resolves #251
const program = new FrodoCommand('frodo admin federation list', ['realm']);

program
  .description('List admin federation providers.')
  // .addOption(
  //   new Option('-l, --long', 'Long with all fields.').default(false, 'false')
  // )
  .action(
    // implement command logic inside action handler
    async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);
<<<<<<< HEAD
      if (await getTokens(true)) {
=======
      if (await frodo.login.getTokens(true)) {
>>>>>>> 4d75d27... update to frodo-lib 2.0.0-8 and resolves #251
        verboseMessage(`Listing admin federation providers...`);
        const outcome = await listAdminFederationProviders();
        if (!outcome) process.exitCode = 1;
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
