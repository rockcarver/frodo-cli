import fs from 'fs';
import { frodo, type FrodoError } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { fileFilter } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { readConfigEntitiesByType, importConfigEntities, deleteConfigEntity } =
  frodo.idm.config;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

/**
 * The schedule that the library names in the error of an entity it could not update.
 * @param {FrodoError} error the error the library reported for one entity
 * @returns {string | undefined} the schedule name, or undefined if the message has another shape
 */
function importedScheduleNameOf(error: FrodoError): string | undefined {
  return error.message?.match(/ config entity schedule\/(.+)$/)?.[1];
}

/**
 * Export schedules in fr-config-manager format.
 * @param {string} name The name of the schedule to export
 * @param {boolean} allowFailures true to succeed although some schedules could not be exported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to false if a named schedule does not exist, the schedules cannot be read, or a schedule cannot be exported (unless failures are allowed). No schedules when none was named is a success.
 */
export async function configManagerExportSchedules(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const schedules = (await readConfigEntitiesByType('schedule')).filter(
      (schedule: any) =>
        schedule._id !== 'scheduler' &&
        (!name || schedule._id.split('/')[1] === name)
    );
    if (name && schedules.length === 0) {
      printMessage(`Schedule '${name}' not found.`, 'error');
      return false;
    }
    if (schedules.length === 0) {
      printMessage('No schedules found to export.');
      return true;
    }
    const run = new OperationRun({ unit: 'schedule', allowFailures });
    for (const schedule of schedules as any[]) {
      const scheduleName = schedule._id.split('/')[1];
      try {
        const scheduleDir = `schedules/${scheduleName}`;
        const scriptFilename = `${scheduleName}.js`;
        if (
          schedule.invokeService === 'script' &&
          schedule.invokeContext?.script?.source
        ) {
          extractFrConfigDataToFile(
            schedule.invokeContext.script.source,
            scriptFilename,
            scheduleDir
          );
          delete schedule.invokeContext.script.source;
          schedule.invokeContext.script.file = scriptFilename;
        } else if (
          schedule.invokeService === 'taskscanner' &&
          schedule.invokeContext?.task?.script?.source
        ) {
          extractFrConfigDataToFile(
            schedule.invokeContext.task.script.source,
            scriptFilename,
            scheduleDir
          );
          delete schedule.invokeContext.task.script.source;
          schedule.invokeContext.task.script.file = scriptFilename;
        }

        const scheduleFilename = `${scheduleDir}/${scheduleName}.json`;
        saveJsonToFile(
          schedule,
          getFilePath(scheduleFilename, true),
          false,
          true
        );
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error exporting schedule ${scheduleName}`);
        run.recordFailure(scheduleName, causeOf(error));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting schedules to files`);
  }
  return false;
}

/**
 * Import schedules in fr-config-manager format.
 * @param {string} schedulesName Optional name of the schedule to import. If not provided, imports all schedules.
 * @param {string} filenameFilter Optional filter to filter which scripts are imported.
 * @param {boolean} allowFailures true to succeed although some schedules could not be imported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to false if the schedules folder or a named schedule does not exist, or a schedule cannot be read or imported (unless failures are allowed). No schedules to import when none was named is a success.
 */
export async function configManagerImportSchedules(
  schedulesName?: string,
  filenameFilter?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const schedulesPath = getFilePath('schedules');
    if (!fs.existsSync(schedulesPath)) {
      printMessage(`Schedules folder not found: ${schedulesPath}`, 'error');
      return false;
    }
    const schedulesFiles = fs.readdirSync(schedulesPath);
    const run = new OperationRun({ unit: 'schedule', allowFailures });
    const importScheduleData = { idm: {} };
    let nameFound = false;
    for (const schedulesFile of schedulesFiles) {
      try {
        const jsonFilePath = getFilePath(
          `schedules/${schedulesFile}/${schedulesFile}.json`
        );
        if (!fs.existsSync(jsonFilePath)) continue;
        const importData = readJsonFile(jsonFilePath) as any;
        const id = importData._id;
        if (schedulesName && id !== `schedule/${schedulesName}`) {
          continue;
        }
        nameFound = true;
        if (
          importData.invokeService === 'script' &&
          importData.invokeContext?.script?.file
        ) {
          if (
            !fileFilter(importData.invokeContext.script.file, filenameFilter)
          ) {
            continue;
          }
          const scriptPath = getFilePath(
            `schedules/${schedulesFile}/${importData.invokeContext.script.file}`
          );
          importData.invokeContext.script.source = fs.readFileSync(
            scriptPath,
            'utf8'
          );
          delete importData.invokeContext.script.file;
        } else if (
          importData.invokeService === 'taskscanner' &&
          importData.invokeContext?.task?.script?.file
        ) {
          if (
            !fileFilter(
              importData.invokeContext.task.script.file,
              filenameFilter
            )
          ) {
            continue;
          }
          const scriptPath = getFilePath(
            `schedules/${schedulesFile}/${importData.invokeContext.task.script.file}`
          );
          importData.invokeContext.task.script.source = fs.readFileSync(
            scriptPath,
            'utf8'
          );
          delete importData.invokeContext.task.script.file;
        }
        importScheduleData.idm[id] = importData;
      } catch (error) {
        // a schedule that cannot be read or parsed is a failed schedule
        printError(error, `Error reading schedule ${schedulesFile}`);
        run.recordFailure(schedulesFile, causeOf(error));
      }
    }
    if (schedulesName && !nameFound) {
      printMessage(
        `Schedule '${schedulesName}' not found in ${schedulesPath}`,
        'error'
      );
      return false;
    }
    if (Object.keys(importScheduleData.idm).length === 0 && !run.hasFailures) {
      printMessage(`No schedules found to import in ${schedulesPath}`);
      return true;
    }
    await importConfigEntities(
      importScheduleData,
      undefined,
      undefined,
      run.resultCallback(importedScheduleNameOf)
    );
    return run.finish();
  } catch (error) {
    printError(error, `Error importing schedules`);
  }
  return false;
}

/**
 * Delete schedules using fr-config-manager selection rules.
 * @param {string} name Optional exact schedule name. If omitted, targets all schedules.
 * @param {boolean} dryRun Show matching schedules without deleting them.
 * @param {boolean} allowFailures Report individual deletion failures without failing the command.
 * @returns {Promise<boolean>} False if reading fails or a deletion fails without allowFailures; otherwise true.
 */
export async function configManagerDeleteSchedules(
  name?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'schedule', allowFailures });
  try {
    const schedules = await readConfigEntitiesByType('schedule/');
    const selectedSchedules = name
      ? schedules.filter((schedule) => schedule._id === `schedule/${name}`)
      : schedules;

    if (selectedSchedules.length === 0) {
      printMessage(
        name
          ? `Warning: schedule '${name}' not found.`
          : 'No schedules found to delete.',
        'warn'
      );
      return true;
    }
    for (const schedule of selectedSchedules) {
      const scheduleName = schedule._id.slice('schedule/'.length);

      if (dryRun) {
        printMessage(`Dry run: Deleting schedule: ${scheduleName}`);
        continue;
      }
      try {
        await deleteConfigEntity(schedule._id);
        printMessage(`Deleting schedule: ${scheduleName}`);
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error deleting schedule ${scheduleName}`);
        run.recordFailure(scheduleName, causeOf(error));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error deleting schedules');
    return false;
  }
}
