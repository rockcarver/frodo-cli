import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  configManagerExportScript,
  configManagerExportScriptsAll,
  configManagerExportScriptsRealms,
} from '../../../configManagerOps/FrConfigScriptOps';
import { getTokens } from '../../../ops/AuthenticateOps';
import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

const deploymentTypes = ['cloud'];
const { constants } = frodo.utils;
const { readRealms } = frodo.realm;

export default function setup() {
  const program = new FrodoCommand(
    'frodo config-manager pull scripts',
    deploymentTypes
  );

  program
    .description('Export authorization scripts.')
    .addOption(
      new Option(
        '-r, --realm <realm>',
        'Specifies the realm to export from. Only the scripts from this realm will be exported.'
      )
    )
    .addOption(
      new Option(
        '-n, --script-name <script name>',
        'Export specific script using filename. Omit file extension.'
      )
    )
    // added because fr-config manager has a SCRIPT_PREFIXES=[] variable in its .env configuration file to specify scripts
    .addOption(
      new Option(
        '-p, --prefix <prefix>',
        'Export all scripts that start with a certain prefix. Ignored with -n'
      )
    )
    .addOption(
      new Option(
        '--just-content',
        'Export only the script .js files, no config files'
      )
    )
    .addOption(
      new Option(
        '--just-config',
        'Export only the config .json files, no scripts. Ignored with --just-content'
      )
    )
    .addOption(
      new Option(
        '--script-type <script type>',
        'Export all scripts of a certain type. Ignored with -n.'
      )
    )
    .addOption(
      new Option(
        // the two options are groovy and all because the command "fr-config-pull scripts" in fr-config manager with no specified arguements returns only js files
        '--language <programming language>',
        'Export all scripts written a certain programming language. ALL, GROOVY, or JAVASCRIPT. defaults to JAVASCRIPT. Ignored with -n'
      )
    )

    .addHelpText(
      'after',
      'Availble script types: \n' +
        'AUTHENTICATION_TREE_DECISION_NODE\n' +
        'SAML2_SP_ADAPTER\n' +
        'OAUTH2_ACCESS_TOKEN_MODIFICATION\n' +
        'Scripted Decision Node\n' +
        'AUTHENTICATION_CLIENT_SIDE\n' +
        'DEVICE_MATCH_NODE\n' +
        'OAUTH2_SCRIPTED_JWT_ISSUER\n' +
        'AUTHENTICATION_SERVER_SIDE\n' +
        'SOCIAL_IDP_PROFILE_TRANSFORMATION\n' +
        'CONFIG_PROVIDER_NODE\n' +
        'OAUTH2_VALIDATE_SCOPE\n' +
        'LIBRARY\n' +
        'OAUTH2_AUTHORIZE_ENDPOINT_DATA_PROVIDER\n' +
        'OAUTH2_EVALUATE_SCOPE\n' +
        'POLICY_CONDITION\n' +
        'OIDC_CLAIMS\n' +
        'SAML2_IDP_ADAPTER\n' +
        'PingOne Verify Completion Decision Node\n' +
        'SAML2_NAMEID_MAPPER\n' +
        'SAML2_IDP_ATTRIBUTE_MAPPER\n' +
        'CONFIG_PROVIDER_NODE\n' +
        'OAUTH2_MAY_ACT'
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

      // -r/--realm flag has precedence over [realm] arguement
      if (options.realm) {
        realm = options.realm;
      }

      const hasOptions: boolean =
        options.language ||
        options.scriptType ||
        options.justConfig ||
        options.justContent ||
        options.prefix;

      if (await getTokens(false, true, deploymentTypes)) {
        let outcome: boolean;

        // -n/--script-name
        if (options.scriptName) {
          // try and find script in current realm
          printMessage(
            `Exporting script ${options.scriptName} from the ${state.getRealm()} realm.`
          );
          const originalRealm: string = state.getRealm();
          outcome = await configManagerExportScript(
            {
              scriptName: options.scriptName,
            },
            options.justContent,
            options.justConfig
          );

          // check other realms for the script
          if (!outcome) {
            for (const realm of await readRealms()) {
              if (outcome) {
                break;
              }
              if (realm.name !== originalRealm) {
                printMessage(
                  `Exporting script ${options.scriptName} from the ${state.getRealm()} realm failed.`
                );
                state.setRealm(realm.name);
                printMessage(
                  `Looking for the ${options.scriptName} script in the ${state.getRealm()} realm now.`
                );
                outcome = await configManagerExportScript(
                  {
                    scriptName: options.scriptName,
                  },
                  options.justContent,
                  options.justConfig
                );
              }
            }
            if (!outcome) {
              printMessage(
                `Did not find the script "${options.scriptName}" anywhere.`
              );
            }
          }
        }

        // -r/--realm
        else if (realm !== constants.DEFAULT_REALM_KEY) {
          printMessage(
            `Exporting scripts from the ${state.getRealm()} realm${hasOptions ? ' with custom options.' : '.'}`
          );
          outcome = await configManagerExportScriptsRealms(
            options.prefix,
            options.justContent,
            options.justConfig,
            options.scriptType,
            options.language
          );
        }

        // export all, the default
        else {
          printMessage(
            `Exporting scripts from entire tenant${hasOptions ? ' with custom options.' : '.'}`
          );
          outcome = await configManagerExportScriptsAll(
            options.prefix,
            options.justContent,
            options.justConfig,
            options.scriptType,
            options.language
          );
        }

        if (!outcome) {
          process.exitCode = 1;
        }
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
