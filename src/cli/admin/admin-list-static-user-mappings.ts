import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

const { getTokens } = frodo.login;
const { listNonOAuth2AdminStaticUserMappings } = frodo.admin;

const program = new FrodoCommand('frodo admin list-static-user-mappings');

program
  .description(
    'List all subjects of static user mappings that are not oauth2 clients.'
  )
  .addOption(
    new Option('--show-protected', 'Show protected (system) subjects.').default(
      false,
      'false'
    )
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
        printMessage(
          'Listing all non-oauth2 client subjects of static user mappings...'
        );
        const subjects = await listNonOAuth2AdminStaticUserMappings(
          options.showProtected
        );
        subjects.sort((a, b) => a.localeCompare(b));
        subjects.forEach((item) => {
          printMessage(`${item}`);
        });
      } else {
        process.exitCode = 1;
      }
    }
    // end command logic inside action handler
  );

program.parse();
