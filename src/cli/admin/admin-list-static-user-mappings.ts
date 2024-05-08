import { Option } from 'commander';

import { listNonOAuth2AdminStaticUserMappings } from '../../ops/AdminOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console.js';
import { FrodoCommand } from '../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo admin list-static-user-mappings');

  program
    .description(
      'List all subjects of static user mappings that are not oauth2 clients.'
    )
    .addOption(
      new Option(
        '--show-protected',
        'Show protected (system) subjects.'
      ).default(false, 'false')
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
          const outcome = await listNonOAuth2AdminStaticUserMappings(
            options.showProtected
          );
          if (!outcome) process.exitCode = 1;
        } else {
          process.exitCode = 1;
        }
      }
      // end command logic inside action handler
    );

  return program;
}
