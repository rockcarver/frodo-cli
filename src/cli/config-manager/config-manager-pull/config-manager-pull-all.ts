import { Option } from 'commander';
import { configManagerExportAllWithConfigFolder } from '../../../configManagerOps/FrConfigAllOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { verboseMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

export default function setup() {
  const program = new FrodoCommand('frodo config-manager pull all');
  program
    .description('Export all config.')
    .addHelpText(
      'after',
      '\nNote: with a realm, the realm-specific config is exported for that realm only. The result is a partial snapshot, which cannot be promoted by itself, because promotion always covers all realms. Tenant-wide config is always exported in full.\n'
    )
    .addOption(
      new Option(
        '-C, --config-folder <config-folder-path>',
        'Path to the folder containing the config files.\n'
      ).makeOptionMandatory()
    )
    .addHelpText(
      'after',
      'The following entities require config files to be exported:\n' +
        '- authz-policies\n' +
        '- oauth2-agents\n' +
        '- saml\n' +
        '- service-objects\n\n' +
        'Each config file must be named after the command it applies to. For example,\n' +
        'the config file for "authz-policies" should be named "authz-policies.json".\n' +
        'Please refer to the help message of each command to see an example config file by running:\n' +
        '"frodo config-manager pull <entity-name> -h"'
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

      if (!(await getTokens())) {
        process.exitCode = 1;
        return;
      }
      verboseMessage('Exporting config files that fr-config-manager supports.');
      const outcome = await configManagerExportAllWithConfigFolder({
        configFolder: options.configFolder,
        realm,
      });
      if (!outcome) process.exitCode = 1;
    });

  return program;
}
