import { configManagerExportAllStatic } from '../../../configManagerOps/FrConfigAllOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull all-static');
  program
    .description('Export all static config.')
    .multiOp()
    .addHelpText(
      'after',
      '\nNote: with a realm, the realm-specific config is exported for that realm only. The result is a partial snapshot, which cannot be promoted by itself, because promotion always covers all realms. Tenant-wide config is always exported in full.\n\nCIMD profiles and trusted JWT issuers are not part of this export (they are dynamic configuration); use pull all, pull cimd-profiles or pull trusted-jwt-issuers.\n'
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
      verboseMessage('Exporting all static config');
      const outcome = await configManagerExportAllStatic({
        realm: realmOfRun(command, realm),
        allowFailures: options.allowFailures,
      });
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
