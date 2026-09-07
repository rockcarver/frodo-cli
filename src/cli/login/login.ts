import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens, getTokensInteractive } from '../../ops/AuthenticateOps';
import c from '../../utils/ColorTheme';
import { printMessage } from '../../utils/Console';
import { AUTHENTICATION_OPTIONS_HEADING, FrodoCommand } from '../FrodoCommand';

const { saveConnectionProfile } = frodo.conn;

export default function setup() {
  const program = new FrodoCommand('login', ['realm']);
  // Every option on `login` already IS an authentication option, so a
  // separate "Authentication Options:" section doesn't add information —
  // fold it into the plain "Options:" section instead, sorted the same way
  // as every other option on this command.
  program.mergeHeadingIntoOptions(AUTHENTICATION_OPTIONS_HEADING);

  program
    .description('Authenticate to a cloud, forgeops, or classic deployment.')
    .addOption(
      new Option(
        '--login-scope <scope>',
        'Override the default OAuth2 scope requested for browser login. Ignored without --browser/--device. Defaults per deployment type: \n\
cloud:    "fr:am:* fr:idm:*" \n\
forgeops: "fr:idm:* openid" \n\
classic:  "openid"'
      )
    )
    .addOption(
      new Option(
        '--save',
        'Save a connection profile for this host after a successful login.'
      )
    )
    .addOption(
      new Option(
        '--alias [name]',
        'Alias name for the saved connection profile. Ignored without --save. Lets later commands address this session by an alias.'
      )
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Login with a username and password:\n` +
        c.command(
          `  $ frodo login ${s.amBaseUrl} ${s.username} '${s.password}'\n`
        ) +
        `  Login with a username and password and save a connection profile:\n` +
        c.command(
          `  $ frodo login --save ${s.amBaseUrl} ${s.username} '${s.password}'\n`
        ) +
        `  Login via an interactive browser and save a connection profile so later commands reuse it:\n` +
        c.command(
          `  $ frodo login --browser --save --type cloud ${s.amBaseUrl}\n`
        ) +
        `  Login via the OAuth2 Device Authorization Grant, for headless/SSH sessions:\n` +
        c.command(
          `  $ frodo login --device --save --type cloud ${s.amBaseUrl}\n`
        ) +
        `  Login to two different hosts under different aliases, so later commands can address each one by its alias:\n` +
        c.command(
          `  $ frodo login --browser --save --alias simulation --login-client-id ${s.loginClientId} --type forgeops ${s.amBaseUrl}\n` +
            `  $ frodo login --browser --save --alias reality --login-client-id ${s.loginClientId} --type forgeops ${s.amBaseUrl2}\n`
        )
    )
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);

      if (state.getAuthMode() === 'interactive') {
        const tokens = await getTokensInteractive({
          loginScope: options.loginScope,
          loginRedirectUri: options.loginRedirectUri,
        });
        if (!tokens) {
          process.exitCode = 1;
          return;
        }
        printMessage(
          `Logged in to ${tokens.host} [${tokens.realm}] as ${tokens.subject}`
        );
      } else {
        if (!(await getTokens())) {
          process.exitCode = 1;
          return;
        }
        printMessage(
          `Logged in to ${state.getHost()} [${
            state.getRealm() ? state.getRealm() : 'root'
          }]`
        );
      }

      if (options.save) {
        try {
          if (options.alias) {
            state.setAlias(options.alias);
          }
          await saveConnectionProfile(host);
          printMessage(`Saved connection profile ${state.getHost()}`);
        } catch (error) {
          printMessage(
            `Error saving connection profile: ${error.message}`,
            'error'
          );
          process.exitCode = 1;
        }
      }
    });

  return program;
}
