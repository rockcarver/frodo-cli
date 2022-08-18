#!/usr/bin/env -S node --no-warnings --enable-source-maps

import { ConnectionProfileOps, state } from '@rockcarver/frodo-lib';
import fs from 'fs';
import { Command } from 'commander';
// import pkg from '../package.json' assert { type: 'json' };

// commands
import admin from './cli/admin/admin.js';
import app from './cli/app/app.js';
import conn from './cli/conn/conn.js';
import email from './cli/email/email.js';
import esv from './cli/esv/esv.js';
import idm from './cli/idm/idm.js';
import idp from './cli/idp/idp.js';
import info from './cli/info/info.js';
import journey from './cli/journey/journey.js';
import logging from './cli/logging/logs.js';
import realm from './cli/realm/realm.js';
import saml from './cli/saml/saml.js';
import script from './cli/script/script.js';
import theme from './cli/theme/theme.js';

const pkg = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url))
);

const { initConnectionProfiles } = ConnectionProfileOps;

const program = new Command(pkg.name).version(
  `v${pkg.version} [${process.version}]`,
  '-v, --version'
);

(async () => {
  try {
    initConnectionProfiles();

    program.addCommand(admin());
    program.addCommand(app());
    program.addCommand(conn());
    program.addCommand(email());
    program.addCommand(esv());
    program.addCommand(idm());
    program.addCommand(idp());
    program.addCommand(info());
    program.addCommand(journey());
    program.addCommand(logging());
    program.addCommand(realm());
    program.addCommand(saml());
    program.addCommand(script());
    program.addCommand(theme());

    program.showHelpAfterError();
    program.enablePositionalOptions();
    program.parse();
  } catch (e) {
    console.log(`ERROR: exception running frodo - ${e}`, 'error');
  }
})();
