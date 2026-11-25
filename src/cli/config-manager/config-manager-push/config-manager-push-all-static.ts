import { configManagerImportAllStatic } from '../../../configManagerOps/FrConfigAllOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand, ObjectOption } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull all-static');
  program
    .description('Export all static config.')
    .addOption(
      new ObjectOption(
        '-M, --metadata <value>',
        'Configuration metadata; set properties using dot notation, for example: -M.pushedAt 2026-11-26T00:46:38Z -M.versionInfo.version 1.0 --metadata.versionInfo.stable'
      )
    )
    .multiOp()
    .addHelpText(
      'after',
      '\nNote: with a realm, the realm-specific config is pushed for that realm only.\n'
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
