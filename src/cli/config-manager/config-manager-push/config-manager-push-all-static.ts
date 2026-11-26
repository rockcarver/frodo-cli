import { configManagerImportAllStatic } from '../../../configManagerOps/FrConfigAllOps';
import * as s from '../../../help/SampleData';
import { getTokens } from '../../../ops/AuthenticateOps';
import c from '../../../utils/ColorTheme';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand, ObjectOption } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager push all-static');
  program
    .description('Import all static configuration.')
    .addOption(
      new ObjectOption(
        '-M, --metadata <value>',
        'Configuration metadata written to custom-config.metadata; set properties using dot notation, for example: -M.pushedAt 2026-11-26T00:00:00Z -M.versionInfo.version 1.0 --metadata.versionInfo.stable. Without it the metadata of the tenant is left as it is.'
      )
    )
    .multiOp()
    .addHelpText(
      'after',
      '\nNote: with a realm, the realm-specific config is pushed for that realm only. The command replaces the configuration it pushes and asks no question. A type whose folder is not in the tree is skipped with a warning; a tree that holds none of them is an error.\n'
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Push all static configuration from the folder ./config using a connection profile:\n` +
        c.command(
          `  $ frodo config-manager push all-static -D ./config ${s.connId}\n`
        ) +
        `  Push it for one realm and log in with AM base URL, username, and password:\n` +
        c.command(
          `  $ frodo config-manager push all-static -D ./config ${s.amBaseUrl} alpha ${s.username} '${s.password}'\n`
        ) +
        `  Stamp the metadata of the tenant in the same run:\n` +
        c.command(
          `  $ frodo config-manager push all-static -D ./config -M pushedAt=2026-11-26T00:00:00Z -M versionInfo.version=1.0 ${s.connId}\n`
        ) +
        `  Report failed steps but exit with code 0:\n` +
        c.command(
          `  $ frodo config-manager push all-static -D ./config --allow-failures ${s.connId}\n`
        )
    )
    .usesRealm({ tenantWide: true })
    .action(async (host, realm, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        user,
        password,
        options,
        command
      );

      if (!(await getTokens())) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Importing all static config');
      const outcome = await configManagerImportAllStatic({
        realm: realmOfRun(command, realm),
        allowFailures: options.allowFailures,
        metadata: options.metadata,
      });
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
