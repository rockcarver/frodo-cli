import fs from 'fs';
import path from 'path';
import type { FeatureRepairPlan } from './FeatureRepairTypes';

/** Mode of the backup directory when this creates it: the owner only. */
const DIRECTORY_MODE = 0o700;

/** Mode of a backup file: the owner only. */
const FILE_MODE = 0o600;

/**
 * A name that is safe as a part of a file name: the characters outside
 * letters, digits, dot, underscore and dash become an underscore.
 * @param {string} name a realm name, a managed object type
 * @returns {string} the name as a part of a file name
 */
function fileNamePart(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * The time as a part of a file name: `20261114T231500Z`.
 * @param {Date} time the time
 * @returns {string} the stamp
 */
export function backupStamp(time: Date): string {
  return time
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
}

/**
 * What goes into the backup of a repair, as `[file name part, content]`: the
 * raw configuration the repair would overwrite or delete, as the tenant
 * returned it (the plan's `backup`), and the diagnosis and the steps the plan
 * was made from. The OAuth 2.0 provider of a realm and the IDM objects are one
 * file each. A part the tenant did not have (a realm without a provider) is
 * left out.
 * @param {FeatureRepairPlan} plan the plan
 * @returns {[string, unknown][]} the parts
 */
function backupParts(plan: FeatureRepairPlan): [string, unknown][] {
  const { backup } = plan;
  const parts: [string, unknown][] = [
    [
      'plan',
      {
        featureId: plan.featureId,
        options: plan.options,
        diagnosis: plan.diagnosis,
        steps: plan.steps,
      },
    ],
    ['feature', backup.feature],
    ['config-managed', backup.managed],
    ['config-repo.ds', backup.repoDs],
  ];
  for (const [realm, provider] of Object.entries(backup.providers ?? {})) {
    if (provider === null || provider === undefined) continue;
    parts.push([`oauth2-provider-${fileNamePart(realm)}`, provider]);
  }
  for (const [type, objects] of Object.entries(backup.idmObjects ?? {})) {
    parts.push([`idm-${fileNamePart(type)}`, objects]);
  }
  if ((backup.secretStoreMappings ?? []).length > 0) {
    parts.push(['secret-store-mappings', backup.secretStoreMappings]);
  }
  return parts;
}

/**
 * Writes the backup of a repair into a directory: the raw configuration the
 * repair would overwrite or delete, one JSON file per part, named
 * `<feature id>-<time stamp>-<part>.json`. The directory is created when it
 * does not exist, with owner-only permissions; the files have owner-only
 * permissions too, because a provider holds settings that are not meant to be
 * shared. A file that exists already is never overwritten, so no earlier
 * backup is lost.
 *
 * Call it before the first write of the repair: when it throws, nothing has
 * been changed in the tenant.
 * @param {FeatureRepairPlan} plan the plan, with the backup the library read
 * @param {string} directory where the backup goes, relative to the current directory or absolute
 * @param {Date} [time] the time stamp of the file names. Default: now
 * @returns {string[]} the absolute paths of the files written
 */
export function writeFeatureBackup(
  plan: FeatureRepairPlan,
  directory: string,
  time: Date = new Date()
): string[] {
  const target = path.resolve(directory);
  // a path that is a file makes this throw (EEXIST): nothing is written then
  fs.mkdirSync(target, { recursive: true, mode: DIRECTORY_MODE });
  const stamp = backupStamp(time);
  const written: string[] = [];
  for (const [part, content] of backupParts(plan)) {
    const file = path.join(
      target,
      `${fileNamePart(plan.featureId)}-${stamp}-${part}.json`
    );
    fs.writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`, {
      mode: FILE_MODE,
      flag: 'wx',
    });
    written.push(file);
  }
  return written;
}
