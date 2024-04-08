import { frodo, state } from '@rockcarver/frodo-lib';
import { Command } from 'commander';

// commands
import admin from './cli/admin/admin';
import agent from './cli/agent/agent';
import app from './cli/app/app';
import authn from './cli/authn/authn';
import authz from './cli/authz/authz';
import config from './cli/config/config';
import conn from './cli/conn/conn';
import email from './cli/email/email';
import esv from './cli/esv/esv';
import idm from './cli/idm/idm';
import idp from './cli/idp/idp';
import info from './cli/info/info';
import journey from './cli/journey/journey';
import log from './cli/log/log';
import oauth from './cli/oauth/oauth';
import realm from './cli/realm/realm';
import saml from './cli/saml/saml';
import script from './cli/script/script';
import service from './cli/service/service';
import shell from './cli/shell/shell';
// enable sample command template.
// import something from './cli/_template/something';
import theme from './cli/theme/theme';
import {
  debugMessage,
  printError,
  printMessage,
  verboseMessage,
} from './utils/Console';
import { getVersions } from './utils/Version';

const { initConnectionProfiles } = frodo.conn;
const { initTokenCache } = frodo.cache;

(async () => {
  try {
    // override default library output handlers with our own
    state.setPrintHandler(printMessage);
    state.setErrorHandler(printError);
    state.setDebugHandler(debugMessage);
    state.setVerboseHandler(verboseMessage);

    const program = new Command('frodo').version(
      await getVersions(false),
      '-v, --version'
    );

    printMessage(await getVersions(true), 'text', false);

    await initConnectionProfiles();
    await initTokenCache();

    admin(program);
    program.addCommand(agent());
    program.addCommand(authn());
    program.addCommand(authz());
    program.addCommand(app());
    program.addCommand(config());
    program.addCommand(conn());
    program.addCommand(email());
    program.addCommand(esv());
    program.addCommand(idm());
    program.addCommand(idp());
    program.addCommand(info());
    program.addCommand(journey());
    program.addCommand(log());
    program.addCommand(oauth());
    program.addCommand(realm());
    program.addCommand(saml());
    program.addCommand(script());
    program.addCommand(service());
    program.addCommand(shell());
    program.addCommand(theme());
    // enable sample command template.
    // program.addCommand(something());

    program.showHelpAfterError();
    program.enablePositionalOptions();
    program.parse();
  } catch (e) {
    process.exitCode = 1;
    printMessage(`ERROR: exception running frodo - ${e}`, 'error');
    printMessage(e.stack, 'error');
  }
})();
