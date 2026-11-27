import { FrodoStubCommand } from '../../FrodoCommand';
import CheckLockedStatus from './config-manager-promote-check-locked-status';
import CheckPromotionReports from './config-manager-promote-check-promotion-reports';
import CheckPromotionStatus from './config-manager-promote-check-promotion-status';
import LockTenants from './config-manager-promote-lock-tenants';
import Rollback from './config-manager-promote-rollback';
import RunDryrunPromotion from './config-manager-promote-run-dryrun-promotion';
import RunPromotion from './config-manager-promote-run-promotion';
import UnlockTenants from './config-manager-promote-unlock-tenants';

export default function setup() {
  const program = new FrodoStubCommand('promote')
    .withStability('experimental')
    .description(
      'Promote configuration optimized for CI/CD pipelines (format compatible with fr-config-manager).'
    );
  program.addCommand(
    CheckPromotionStatus()
      .name('status')
      .withAlias('check-promotion-status', 'transition')
  );
  program.addCommand(
    CheckPromotionReports()
      .name('report')
      .withAlias('check-promotion-reports', 'transition')
  );
  program.addCommand(
    LockTenants().name('lock').withAlias('lock-tenants', 'transition')
  );
  program.addCommand(
    UnlockTenants().name('unlock').withAlias('unlock-tenants', 'transition')
  );
  program.addCommand(Rollback().name('rollback'));
  program.addCommand(
    RunDryrunPromotion()
      .name('dry-run')
      .withAlias('run-dryrun-promotion', 'transition')
  );
  program.addCommand(
    RunPromotion().name('run').withAlias('run-promotion', 'transition')
  );
  program.addCommand(
    CheckLockedStatus()
      .name('lock-status')
      .withAlias('check-locked-status', 'transition')
  );
  return program;
}
