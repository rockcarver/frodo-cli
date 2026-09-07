import { frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import * as s from '../../help/SampleData';
import { getTokens } from '../../ops/AuthenticateOps';
import { setupBrowserLogin } from '../../ops/LoginSetupOps';
import c from '../../utils/ColorTheme';
import { AUTHENTICATION_OPTIONS_HEADING, FrodoCommand } from '../FrodoCommand';

const constants = frodo.utils.constants;

/** Used when --login-client-id is omitted. */
const DEFAULT_LOGIN_CLIENT_ID = 'frodo-browser-login';

export default function setup() {
  const program = new FrodoCommand(
    'frodo login setup',
    ['realm'],
    [
      constants.FORGEOPS_DEPLOYMENT_TYPE_KEY,
      constants.CLASSIC_DEPLOYMENT_TYPE_KEY,
    ]
  );
  // Every option on `login setup` already IS an authentication option, same
  // reasoning as `login` itself — fold them into the plain "Options:"
  // section instead of a separate "Authentication Options:" heading.
  program.mergeHeadingIntoOptions(AUTHENTICATION_OPTIONS_HEADING);

  const shortSummary =
    'Setup a forgeops or classic deployment with an OAuth2 client and session-capture script for --browser/--device login.';

  program
    // .summary() is what login --help's "Commands:" list shows for this
    // subcommand (Commander's own subcommandDescription() falls back to
    // .description() only when no .summary() is set) — kept separate from
    // .description() below so the subcommand listing stays one line while
    // this command's own --help page can still show the full detail.
    .summary(shortSummary)
    // A blank line here is a real paragraph break, not just formatting —
    // Commander's Help.boxWrap() (used to render this on this command's own
    // --help page) preserves blank lines between paragraphs instead of
    // collapsing them, so this renders as two separate wrapped paragraphs.
    .description(
      `${shortSummary}\n\n` +
        `Cloud needs no setup. --login-client-id defaults to "${DEFAULT_LOGIN_CLIENT_ID}" if omitted; --login-redirect-uri defaults to a wildcard loopback pattern matching any local port (if the target AM's version supports it) or a fixed URI otherwise — pass --login-redirect-uri explicitly to force a specific value. This is an ordinary (non-interactive) admin login, not a --browser login itself — a host with a saved connection profile (identified by its full URL, a unique substring, or a saved alias) works with no extra arguments; a brand-new host with no saved profile yet needs a username/password (or service account) on the command line. See docs/BROWSER_LOGIN.md.`
    )
    .addOption(
      new Option(
        '--login-scope <scope>',
        'OAuth2 scope for the client. Defaults per deployment type: \n\
forgeops: "openid fr:idm:*" \n\
classic:  "openid"'
      )
    )
    .addOption(
      new Option(
        '--script-id <script-id>',
        'Script id for the session-capture script. Defaults to "<login-client-id>-session-capture".'
      )
    )
    .addOption(
      new Option(
        '--script-name <script-name>',
        'Display name for the session-capture script.'
      ).default('Frodo Browser Login Session Capture')
    )
    .addOption(
      new Option(
        '--yes',
        'Skip the confirmation prompt and apply changes immediately.'
      ).default(false)
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Shortest form — a host with an already-saved connection profile (identified by a unique substring or alias), which already remembers its own deployment type, so --type isn't needed either; also picks up the default client id "${DEFAULT_LOGIN_CLIENT_ID}" and a wildcard loopback redirect URI if the target AM supports it:\n` +
        c.command(`  $ frodo login setup ${s.connId}\n`) +
        `  Same, spelled out with the full host URL and an explicit --type (equivalent when a saved profile already exists for it):\n` +
        c.command(`  $ frodo login setup --type forgeops ${s.amBaseUrl}\n`) +
        `  A brand-new host with no saved connection profile yet — needs a username/password (or service account) and --type, since there's no saved profile to infer either from:\n` +
        c.command(
          `  $ frodo login setup --type forgeops ${s.amBaseUrl} ${s.username} '${s.password}'\n`
        ) +
        `  Pick your own client id, and also enable the device authorization grant on it:\n` +
        c.command(
          `  $ frodo login setup --device --login-client-id ${s.loginClientId} ${s.connId}\n`
        ) +
        `  Force a fixed, exact redirect URI instead of the auto-detected wildcard loopback pattern:\n` +
        c.command(
          `  $ frodo login setup --login-redirect-uri http://127.0.0.1:8080/callback ${s.connId}\n`
        ) +
        `  Then log in (omit --login-redirect-uri too, if the wildcard pattern was used):\n` +
        c.command(
          `  $ frodo login --browser --login-client-id ${DEFAULT_LOGIN_CLIENT_ID} --type forgeops ${s.connId}\n`
        )
    )
    .action(async (host, user, password, options, command) => {
      command.handleDefaultArgsAndOpts(host, user, password, options, command);

      if (!(await getTokens())) {
        process.exitCode = 1;
        return;
      }

      const clientId = options.loginClientId || DEFAULT_LOGIN_CLIENT_ID;
      const deploymentType = state.getDeploymentType();
      const defaultScope =
        deploymentType === constants.CLASSIC_DEPLOYMENT_TYPE_KEY
          ? 'openid'
          : 'openid fr:idm:*';

      const ok = await setupBrowserLogin({
        clientId,
        scriptId: options.scriptId || `${clientId}-session-capture`,
        scriptName: options.scriptName,
        scope: options.loginScope || defaultScope,
        redirectUri: options.loginRedirectUri,
        enableDeviceGrant: !!options.device,
        assumeYes: !!options.yes,
      });
      if (!ok) {
        process.exitCode = 1;
      }
    });

  return program;
}
