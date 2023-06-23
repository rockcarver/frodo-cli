import { frodo } from '@rockcarver/frodo-lib';
import { Command } from 'commander';

// commands
import admin from './cli/admin/admin';
import agent from './cli/agent/agent';
import authz from './cli/authz/authz';
import app from './cli/app/app';
import conn from './cli/conn/conn';
import email from './cli/email/email';
import esv from './cli/esv/esv';
import idm from './cli/idm/idm';
import idp from './cli/idp/idp';
import info from './cli/info/info';
import journey from './cli/journey/journey';
import log from './cli/log/log';
import realm from './cli/realm/realm';
import saml from './cli/saml/saml';
import script from './cli/script/script';
import service from './cli/service/service';
// enable sample command template.
// import something from './cli/_template/something';
import theme from './cli/theme/theme';
import { printMessage } from './utils/Console';
import { getVersions } from './utils/Version';

const { initConnectionProfiles } = frodo.conn;

(async () => {
  try {
    const program = new Command('frodo').version(
      await getVersions(false),
      '-v, --version'
    );

    printMessage(await getVersions(true), 'text', false);

    await initConnectionProfiles();

    program.addCommand(admin());
    program.addCommand(agent());
    program.addCommand(authz());
    program.addCommand(app());
    program.addCommand(conn());
    program.addCommand(email());
    program.addCommand(esv());
    program.addCommand(idm());
    program.addCommand(idp());
    program.addCommand(info());
    program.addCommand(journey());
    program.addCommand(log());
    program.addCommand(realm());
    program.addCommand(saml());
    program.addCommand(script());
    program.addCommand(service());
    program.addCommand(theme());
    // enable sample command template.
    // program.addCommand(something());

    program.showHelpAfterError();
    program.enablePositionalOptions();
    program.parse();
  } catch (e) {
    printMessage(`ERROR: exception running frodo - ${e}`, 'error');
  }
})();
