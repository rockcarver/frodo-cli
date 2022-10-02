#!/usr/bin/env -S node --no-warnings --enable-source-maps --experimental-specifier-resolution=node

import { getVersion, ConnectionProfile } from '@rockcarver/frodo-lib';
import fs from 'fs';
import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

// commands
import admin from './cli/admin/admin';
import app from './cli/app/app';
import conn from './cli/conn/conn';
import email from './cli/email/email';
import esv from './cli/esv/esv';
import idm from './cli/idm/idm';
import idp from './cli/idp/idp';
import info from './cli/info/info';
import journey from './cli/journey/journey';
import logging from './cli/logging/logs';
import realm from './cli/realm/realm';
import saml from './cli/saml/saml';
import script from './cli/script/script';
import theme from './cli/theme/theme';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
);

const { initConnectionProfiles } = ConnectionProfile;

const program = new Command('frodo').version(
  `cli: v${pkg.version}\nlib: ${getVersion()}\nnode: ${process.version}`,
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
