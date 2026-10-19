// Patch node:readline's createInterface (short escape-sequence horizon
// -- see EscapeSequenceTimeout.ts) BEFORE any prompt mounts: the apply
// call sits after the imports (prettier's import sort) but before
// parseAsync, and no createInterface call happens until a prompt mounts
// during parse -- import TIME is irrelevant, first CALL is what counts.
// (The eslint rule that wants imports first is disabled for the call's
// placement, not the imports.)
 
import { frodo, state } from '@rockcarver/frodo-lib';
// commands
import admin from './cli/admin/admin';
import agent from './cli/agent/agent';
import app from './cli/app/app';
import authn from './cli/authn/authn';
import authz from './cli/authz/authz';
import configManager from './cli/config-manager/config-manager';
import config from './cli/config/config';
import conn from './cli/conn/conn';
import directConfigSession from './cli/dcc/dcc';
import debug from './cli/debug/debug';
import email from './cli/email/email';
import esv from './cli/esv/esv';
import feature from './cli/feature/feature';
// enable sample command template.
// import something from './cli/_template/something';
import {
  formatGlobalEnvironmentVariables,
  FrodoStubCommand,
  isFullHelpRequested,
  normalizeExpandedHelpArgv,
} from './cli/FrodoCommand';
import idm from './cli/idm/idm';
import idp from './cli/idp/idp';
import iga from './cli/iga/iga';
import info from './cli/info/info';
import journey from './cli/journey/journey';
import log from './cli/log/log';
import login from './cli/login/login';
import mapping from './cli/mapping/mapping';
import mcp from './cli/mcp/mcp';
import node from './cli/node/node';
import oauth from './cli/oauth/oauth';
import promote from './cli/promote/promote';
import realm from './cli/realm/realm';
import role from './cli/role/role';
import saml from './cli/saml/saml';
import script from './cli/script/script';
import secretstore from './cli/secretstore/secretstore';
import server from './cli/server/server';
import service from './cli/service/service';
import session from './cli/session/session';
import settings from './cli/settings/settings';
import shell from './cli/shell/shell';
import theme from './cli/theme/theme';
import {
  debugMessage,
  printError,
  printMessage,
  verboseMessage,
} from './utils/Console';
import { applyEscapeSequenceTimeout } from './utils/interactive/EscapeSequenceTimeout';
// The double-ESC exit-all unwind signal (consumers throw it; the
// top-level catch below ends the session on it).
import { EXIT_ALL_SIGNAL } from './utils/interactive/ExitAll';
import {
  activatePersistedTheme,
  ensureThemeDetectedIfNeeded,
} from './utils/ThemeConfig';
import { getVersions } from './utils/Version';

applyEscapeSequenceTimeout();

const { initConnectionProfiles } = frodo.conn;
const { initTokenCache } = frodo.cache;

// Temporary mitigation: silence runtime deprecation warnings from transitive deps.
process.noDeprecation = true;
process.argv = normalizeExpandedHelpArgv(process.argv);

(async () => {
  try {
    // override default library output handlers with our own
    state.setPrintHandler(printMessage);
    state.setErrorHandler(printError);
    state.setDebugHandler(debugMessage);
    state.setVerboseHandler(verboseMessage);
    await ensureThemeDetectedIfNeeded();
    activatePersistedTheme();

    const program = new FrodoStubCommand('frodo').version(
      await getVersions(false),
      '-v, --version'
    );
    const utilitiesCommandsHeading = 'Utilities:';
    const ciCommandsHeading = 'Continuous integration:';

    program.addHelpText('after', () =>
      isFullHelpRequested() ? formatGlobalEnvironmentVariables() : ''
    );

    printMessage(await getVersions(true), 'text', false);

    await initConnectionProfiles();
    await initTokenCache();

    program.addCommand(admin().helpGroup(utilitiesCommandsHeading));
    program.addCommand(agent());
    program.addCommand(authn());
    program.addCommand(authz());
    program.addCommand(app());
    program.addCommand(config());
    program.addCommand(configManager().helpGroup(ciCommandsHeading));
    program.addCommand(conn().helpGroup(utilitiesCommandsHeading));
    program.addCommand(debug().helpGroup(utilitiesCommandsHeading));
    program.addCommand(directConfigSession().helpGroup(ciCommandsHeading));
    program.addCommand(email());
    program.addCommand(esv());
    program.addCommand(feature());
    program.addCommand(idm());
    program.addCommand(idp());
    program.addCommand(iga());
    program.addCommand(info().helpGroup(utilitiesCommandsHeading));
    program.addCommand(journey());
    program.addCommand(log().helpGroup(utilitiesCommandsHeading));
    program.addCommand(login().helpGroup(utilitiesCommandsHeading));
    program.addCommand(mapping());
    program.addCommand(mcp().helpGroup(utilitiesCommandsHeading));
    program.addCommand(node());
    program.addCommand(oauth());
    program.addCommand(promote().helpGroup(ciCommandsHeading));
    program.addCommand(realm());
    program.addCommand(role());
    program.addCommand(saml());
    program.addCommand(script());
    program.addCommand(secretstore());
    program.addCommand(server());
    program.addCommand(service());
    program.addCommand(session().helpGroup(utilitiesCommandsHeading));
    program.addCommand(settings().helpGroup(utilitiesCommandsHeading));
    program.addCommand(shell().helpGroup(utilitiesCommandsHeading));
    program.addCommand(theme());
    // enable sample command template.
    // program.addCommand(something());

    program.showHelpAfterError();
    program.enablePositionalOptions();

    // most or all frodo commands use async action handlers
    await program.parseAsync();
  } catch (e) {
    // The double-ESC exit-all unwind (docs/INTERACTIVE-COMMANDS.md): the
    // gesture's consumers throw EXIT_ALL_SIGNAL from any nesting depth;
    // reaching this handler IS the unwind -- the session simply ends
    // (nothing printed: every frame the gesture passed through erased
    // itself; a clean shell return is the whole point of the gesture).
    if (e === EXIT_ALL_SIGNAL) return;
    process.exitCode = 1;
    printError(e);
  }
})();
