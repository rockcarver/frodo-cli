import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { readConfigEntitiesByType, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile } = frodo.utils;
/**
 * Export schedules in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportSchedules(
  name?: string
): Promise<boolean> {
  try {
    const exportData = await readConfigEntitiesByType('schedule');
    processSchedules(exportData, 'schedules', name);
    return true;
  } catch (error) {
    printError(error, `Error exporting internal schedules to files`);
  }
  return false;
}

function processSchedules(schedules, fileDir, name?) {
  try {
    schedules.forEach((schedule) => {
      if (schedule._id !== 'scheduler') {
        const scheduleName = schedule._id.split('/')[1];
        if (name && name !== scheduleName) {
          return;
        }
        const scheduleDir = `${fileDir}/${scheduleName}`;
        const scriptFilename = `${scheduleName}.js`;
        if (
          schedule.invokeService === 'script' &&
          schedule.invokeContext.script.source
        ) {
          extractFrConfigDataToFile(
            schedule.invokeContext.script.source,
            scriptFilename,
            scheduleDir
          );
          delete schedule.invokeContext.script.source;
          schedule.invokeContext.script.file = `${scriptFilename}`;
        } else if (
          schedule.invokeService === 'taskscanner' &&
          schedule.invokeContext.task.script.source
        ) {
          extractFrConfigDataToFile(
            schedule.invokeContext.task.script.source,
            scriptFilename,
            scheduleDir
          );
          delete schedule.invokeContext.task.script.source;
          schedule.invokeContext.task.script.file = `${scriptFilename}`;
        }

        const scheduleFilename = `${scheduleDir}/${scheduleName}.json`;
        saveJsonToFile(
          schedule,
          getFilePath(scheduleFilename, true),
          false,
          true
        );
      }
    });
  } catch (err) {
    printError(err);
  }
}

/**
 * Import schedules in fr-config-manager format.
 * @param {string} schedulesName Optional name of the schedule to import. If not provided, imports all schedules.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportSchedules(
  schedulesName?: string
): Promise<boolean> {
  try {
    const schedulesPath = getFilePath('schedules');
    const schedulesFiles = fs.readdirSync(schedulesPath);
    const importScheduleData = { idm: {} };
    for (const schedulesFile of schedulesFiles) {
      const jsonFilePath = getFilePath(
        `schedules/${schedulesFile}/${schedulesFile}.json`
      );
      if (!fs.existsSync(jsonFilePath)) continue;
      const readJsonSchedules = fs.readFileSync(jsonFilePath, 'utf8');
      const importData = JSON.parse(readJsonSchedules);
      const id = importData._id;
      if (schedulesName && id !== `schedule/${schedulesName}`) {
        continue;
      }
      if (importData.invokeContext?.task?.script?.file) {
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
    }
    await importConfigEntities(importScheduleData);
    return true;
  } catch (error) {
    printError(error, `Error importing internal schedules`);
  }
  return false;
}
