import { frodo } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  exportOrgPrivileges,
  exportOrgPrivilegesAllRealms,
  exportOrgPrivilegesRealm,
} from '../../configManagerOps/FrConfigOrgPrivilegesOps';
import { getTokens } from '../../ops/AuthenticateOps';
import { printMessage } from '../../utils/Console';
import { FrodoCommand } from '../FrodoCommand';

const deploymentTypes = ['cloud'];
const { constants } = frodo.utils;

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager export org-privileges',
    [],
    deploymentTypes
  );

  program
    .description('Export organization privileges config.')
    .addOption(
      new Option(
        '-r, --realm <realm>',
        'Specifies the realm to export from. Only the entity object from this realm will be exported.'
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

      // -r flag has precedence
      if (options.realm) {
        realm = options.realm;
      }

      if (await getTokens(false, true, deploymentTypes)) {
        let outcome: boolean;
        if (realm !== constants.DEFAULT_REALM_KEY) {
          printMessage(
            `Exporting organization privileges config from the realm: "${realm}"`
          );
          outcome =
            (await exportOrgPrivileges()) &&
            (await exportOrgPrivilegesRealm(realm));
        } else {
          printMessage(
            'Exporting oranization privileges config from all realms'
          );
          outcome = await exportOrgPrivilegesAllRealms();
        }

        if (!outcome) process.exitCode = 1;
      }
      // unrecognized combination of options or no options
      else {
        printMessage(
          'Unrecognized combination of options or no options...',
          'error'
        );
        program.help();
        process.exitCode = 1;
      }
    });

  return program;
}
