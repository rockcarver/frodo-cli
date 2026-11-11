import { Option } from 'commander';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import { configManagerImportTrustedJwtIssuers } from '../../../ops/OAuth2TrustedJwtIssuerConfigOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager push trusted-jwt-issuers'
  );

  program
    .summary('Import trusted JWT issuers from the files written by pull.')
    .description(
      'Import OAuth2 trusted JWT issuers from the files realms/<realm>/realm-config/agents/TrustedJwtIssuer/<name>.json that "pull trusted-jwt-issuers" and "pull oauth2-agents" write, from the working directory (-D). An issuer that does not exist is created and one that does is replaced by the file. ${NAME} in a file is replaced by the value of the environment variable NAME. No issuer is ever deleted. A trusted JWT issuer is a trust anchor: a JWT signed by it is accepted as a grant, so read the files before you push them.'
    )
    .addOption(
      new Option(
        '-n, --name <name>',
        'Trusted JWT issuer name (the name of the object, not its iss URL). If specified, pushes only the issuer of the file with that name. Needs a single realm.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Push all trusted JWT issuer files of all realms from the working directory to the tenant:\n` +
        c.command(
          `  $ frodo config-manager push trusted-jwt-issuers ${s.connId}\n`
        ) +
        `  Push the trusted JWT issuer files of one realm:\n` +
        c.command(
          `  $ frodo config-manager push trusted-jwt-issuers ${s.connId} ${s.realm}\n`
        ) +
        `  Push one trusted JWT issuer of a realm:\n` +
        c.command(
          `  $ frodo config-manager push trusted-jwt-issuers -n ${s.trustedJwtIssuerId} ${s.connId} ${s.realm}\n`
        ) +
        `  Push from a config directory other than the working directory:\n` +
        c.command(
          `  $ frodo config-manager push trusted-jwt-issuers -D ./config ${s.connId}\n`
        )
    )
    .multiOp()
    .usesRealm()
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (await getTokens()) {
        verboseMessage(
          options.name
            ? `Importing trusted JWT issuer "${options.name}".`
            : 'Importing trusted JWT issuers.'
        );
        const outcome = await configManagerImportTrustedJwtIssuers(
          options.name,
          realmOfRun(command, realm),
          options.allowFailures
        );
        if (!outcome) process.exitCode = 1;
      } else {
        // getTokens() failed (any option combination is valid here).
        process.exitCode = 1;
      }
    });

  return program;
}
