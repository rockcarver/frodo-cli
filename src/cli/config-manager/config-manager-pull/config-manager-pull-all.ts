import { Option } from 'commander';
import { configManagerExportAllWithConfigFolder } from '../../../configManagerOps/FrConfigAllOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { realmOfRun } from '../../../utils/interactive/PositionalArgs';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull all');
  program
    .description('Export all config.')
    .multiOp()
    .addHelpText(
      'after',
      '\nNote: with a realm, the realm-specific config is exported for that realm only. The result is a partial snapshot, which cannot be promoted by itself, because promotion always covers all realms. Tenant-wide config is always exported in full.\n'
    )
    .addOption(
      new Option(
        '-C, --config-folder <config-folder-path>',
        'Path to the folder containing the config files that the entities below read. It is only read from: the exported files are written to the working directory (-D), which the command names when it starts.\n'
      ).makeOptionMandatory()
    )
    .addHelpText(
      'after',
      'The following entities read a config file to know what to export:\n' +
        '- authz-policies\n' +
        '- oauth2-agents\n' +
        '- saml\n' +
        '- service-objects\n\n' +
        'An entity whose config file is not in the config folder is skipped with a\n' +
        'warning, and the others are still exported. A config file that exists but\n' +
        'cannot be read is a failed step.\n\n' +
        'cimd-profiles and trusted-jwt-issuers need no config file. If the config\n' +
        'folder has a cimd-profiles.json or a trusted-jwt-issuers.json, its overrides\n' +
        'are applied to the pulled profiles or issuers (placeholders for values that\n' +
        'differ between environments); without it they are pulled unchanged.\n\n' +
        'Each config file must be named after the command it applies to. For example,\n' +
        'the config file for "authz-policies" should be named "authz-policies.json".\n' +
        'Please refer to the help message of each command to see an example config file by running:\n' +
        '"frodo config-manager pull <entity-name> -h"'
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
      verboseMessage('Exporting config files that fr-config-manager supports.');
      const outcome = await configManagerExportAllWithConfigFolder({
        configFolder: options.configFolder,
        realm: realmOfRun(command, realm),
        allowFailures: options.allowFailures,
      });
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
