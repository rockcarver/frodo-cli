import { Option } from 'commander';

import { configManagerImportSaml } from '../../../configManagerOps/FrConfigSamlOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';


export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push saml',
    [],
  );
  program
    .description('Import saml configuration.')
    .addOption(
      new Option(
        '-n, --name <name>',
        'The entityId (or COT _id) of a single SAML entity to import.'
      )
    )
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );
      const getTokensIsSuccessful = await getTokens(
        false,
        true,
      );
      if (!getTokensIsSuccessful) process.exit(1)
        verboseMessage('Importing SAML configuration.')
      const outcomne = await configManagerImportSaml(
        options.name,
      )
    });
  return program;
}
