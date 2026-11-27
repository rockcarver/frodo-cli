import DeleteCmd from '../config-manager/config-manager-delete/config-manager-delete';
import MigrateCmd from '../config-manager/config-manager-migrate/config-manager-migrate';
import PromoteCMD from '../config-manager/config-manager-promote/config-manager-promote';
import PullCmd from '../config-manager/config-manager-pull/config-manager-pull';
import PushCmd from '../config-manager/config-manager-push/config-manager-push';
import { FrodoStubCommand } from '../FrodoCommand';
import ExportCmd from './config-export.js';
import ImportCmd from './config-import.js';

export default function setup() {
  const program = new FrodoStubCommand('config')
    .withAlias('config-manager', 'transition')
    .description(
      'Manage configuration: export and import it as JSON, or pull, push, delete and promote it as one file per object for CI/CD pipelines (format compatible with fr-config-manager).'
    );

  program.addCommand(ExportCmd().name('export'));
  program.addCommand(ImportCmd().name('import'));

  program.addCommand(PullCmd().name('pull'));
  program.addCommand(PushCmd().name('push'));
  program.addCommand(DeleteCmd().name('delete'));
  program.addCommand(MigrateCmd().name('migrate'));
  program.addCommand(PromoteCMD().name('promote'));

  return program;
}
