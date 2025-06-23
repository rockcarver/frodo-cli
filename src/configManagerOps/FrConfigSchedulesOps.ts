import { frodo } from '@rockcarver/frodo-lib';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { readConfigEntitiesByType } = frodo.idm.config;
const { getFilePath, saveJsonToFile } = frodo.utils;
/**
 * Export an internal roles in fr-config-manager format.
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
    });
  } catch (err) {
    printError(err);
  }
}
