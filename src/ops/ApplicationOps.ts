import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import type {
  ApplicationExportInterface,
  ApplicationExportOptions,
  ApplicationImportOptions,
} from '@rockcarver/frodo-lib/types/ops/ApplicationOps';
import fs from 'fs';

import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import wordwrap from './utils/Wordwrap';

const {
  getTypedFilename,
  titleCase,
  getFilePath,
  getWorkingDirectory,
  saveJsonToFile,
} = frodo.utils;
const {
  readApplications: _readApplications,
  deleteApplicationByName: _deleteApplicationByName,
  deleteApplications: _deleteApplications,
  exportApplication: _exportApplication,
  exportApplicationByName: _exportApplicationByName,
  exportApplications: _exportApplications,
  importApplicationByName: _importApplicationByName,
  importFirstApplication: _importFirstApplication,
  importApplications: _importApplications,
} = frodo.app;

/**
 * List applications
 */
export async function listApplications(long = false): Promise<boolean> {
  try {
    const applications = await _readApplications();
    applications.sort((a, b) => a.name.localeCompare(b.name));
    if (long) {
      const table = createTable([
        'Name',
        'Id',
        'Template',
        {
          hAlign: 'right',
          content: 'Version',
        },
        {
          hAlign: 'right',
          content: 'Authoritative',
        },
        'Description',
      ]);
      applications.forEach((app) => {
        table.push([
          app.name,
          app._id,
          app.templateName,
          {
            hAlign: 'right',
            content: app.templateVersion,
          },
          {
            hAlign: 'right',
            content: app.authoritative,
          },
          wordwrap(app.description, 30),
        ]);
      });
      printMessage(table.toString(), 'data');
    } else {
      applications.forEach((app) => {
        printMessage(`${app.name}`, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete application
 * @param {string} applicationName application name
 * @param {boolean} deep deep delete (include dependencies)
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteApplication(
  applicationName: string,
  deep: boolean
): Promise<boolean> {
  let spinnerId: string;
  try {
    debugMessage(`cli.ApplicationOps.deleteApplication: begin`);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Deleting ${applicationName}...`
    );
    await _deleteApplicationByName(applicationName, deep);
    stopProgressIndicator(spinnerId, `Deleted ${applicationName}`, 'success');
    debugMessage(`cli.ApplicationOps.deleteApplication: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error deleting ${applicationName}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Delete all applications
 * @param {boolean} deep deep delete (include dependencies)
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteApplications(deep: boolean): Promise<boolean> {
  let spinnerId: string;
  try {
    debugMessage(`cli.ApplicationOps.deleteApplications: begin`);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Deleting applications...`
    );
    const deleted = await _deleteApplications(deep);
    stopProgressIndicator(
      spinnerId,
      `Deleted ${deleted.length} applications`,
      'success'
    );
    debugMessage(`cli.ApplicationOps.deleteApplications: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error deleting applications`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export application to file
 * @param {string} applicationName application name
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {ApplicationExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportApplicationToFile(
  applicationName: string,
  file: string,
  includeMeta: boolean,
  options: ApplicationExportOptions = { useStringArrays: true, deps: true }
) {
  let spinnerId: string;
  try {
    debugMessage(`cli.ApplicationOps.exportApplicationToFile: begin`);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Exporting ${applicationName}...`
    );
    let fileName = getTypedFilename(applicationName, 'application');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await _exportApplicationByName(applicationName, options);
    saveJsonToFile(exportData, filePath, includeMeta);
    stopProgressIndicator(
      spinnerId,
      `Exported ${applicationName} to ${filePath}.`,
      'success'
    );
    debugMessage(`cli.ApplicationOps.exportApplicationToFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error exporting ${applicationName}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export all applications to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {ApplicationExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportApplicationsToFile(
  file: string,
  includeMeta: boolean,
  options: ApplicationExportOptions = { useStringArrays: true, deps: true }
): Promise<boolean> {
  let spinnerId: string;
  try {
    debugMessage(`cli.ApplicationOps.exportApplicationsToFile: begin`);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Exporting applications...`
    );
    
    let fileName = getTypedFilename(
      `all${titleCase(frodo.utils.getRealmName(state.getRealm()))}Applications`,
      'application'
    );
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await _exportApplications(options);
    saveJsonToFile(exportData, filePath, includeMeta);
    stopProgressIndicator(
      spinnerId,
      `Exported applications to ${filePath}.`,
      'success'
    );
    debugMessage(`cli.ApplicationOps.exportApplicationsToFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error exporting applications`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export all applications to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {ApplicationExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportApplicationsToFiles(
  includeMeta: boolean,
  options: ApplicationExportOptions = { useStringArrays: true, deps: true }
) {
  debugMessage(`cli.ApplicationOps.exportApplicationsToFiles: begin`);
  const errors: Error[] = [];
  let totalBarId: string;
  try {
    const applications = await _readApplications();
    totalBarId = createProgressIndicator(
      'determinate',
      applications.length,
      'Exporting applications...'
    );
    for (const application of applications) {
      const fileBarId = createProgressIndicator(
        'determinate',
        1,
        `Exporting application ${application.name}...`
      );
      const file = getFilePath(
        getTypedFilename(application.name, 'application'),
        true
      );
      try {
        updateProgressIndicator(totalBarId, `Exporting ${application.name}.`);
        const exportData = await _exportApplication(application._id, options);
        saveJsonToFile(exportData, file, includeMeta);
        updateProgressIndicator(
          fileBarId,
          `Saving ${application.name} to ${file}.`
        );
        stopProgressIndicator(
          fileBarId,
          `${application.name} saved to ${file}.`
        );
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(
          totalBarId,
          `Error exporting ${application.name}.`
        );
        stopProgressIndicator(
          fileBarId,
          `Error saving ${application.name} to ${file}.`,
          'fail'
        );
      }
    }
    stopProgressIndicator(totalBarId, `Export complete.`);
    if (errors.length > 0) {
      throw new FrodoError(
        `Error exporting applications(s) to file(s)`,
        errors
      );
    }
    debugMessage(`cli.ApplicationOps.exportApplicationsToFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      totalBarId,
      `Error exporting applications(s) to file(s)`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import application from file
 * @param {string} applicationName client id
 * @param {string} file file name
 * @param {ApplicationImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importApplicationFromFile(
  applicationName: string,
  file: string,
  options: ApplicationImportOptions = { deps: true }
): Promise<boolean> {
  let spinnerId: string;
  try {
    debugMessage(`cli.ApplicationOps.importApplicationFromFile: begin`);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Exporting applications...`
    );
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await _importApplicationByName(applicationName, fileData, options);
    stopProgressIndicator(spinnerId, `Imported ${applicationName}`, 'success');
    debugMessage(`cli.ApplicationOps.importApplicationFromFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error importing ${applicationName}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import first application from file
 * @param {string} file file name
 * @param {ApplicationImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstApplicationFromFile(
  file: string,
  options: ApplicationImportOptions = { deps: true }
): Promise<boolean> {
  let spinnerId: string;
  try {
    debugMessage(`cli.ApplicationOps.importFirstApplicationFromFile: begin`);
    const filePath = getFilePath(file);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing ${filePath}...`
    );
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await _importFirstApplication(fileData, options);
    stopProgressIndicator(spinnerId, `Imported ${filePath}`, 'success');
    debugMessage(`cli.ApplicationOps.importFirstApplicationFromFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error importing first application`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import applications from file
 * @param {string} file file name
 * @param {ApplicationImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importApplicationsFromFile(
  file: string,
  options: ApplicationImportOptions = { deps: true }
): Promise<boolean> {
  let spinnerId: string;
  try {
    debugMessage(`cli.ApplicationOps.importApplicationsFromFile: begin`);
    const filePath = getFilePath(file);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing ${filePath}...`
    );
    const data = fs.readFileSync(filePath, 'utf8');
    const applicationData = JSON.parse(data);
    await _importApplications(applicationData, options);
    stopProgressIndicator(spinnerId, `Imported ${filePath}`, 'success');
    debugMessage(`cli.ApplicationOps.importApplicationsFromFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error importing first application`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import applications from files
 * @param {ApplicationImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importApplicationsFromFiles(
  options: ApplicationImportOptions = { deps: true }
): Promise<boolean> {
  const errors = [];
  let barId: string;
  try {
    debugMessage(`cli.ApplicationOps.importApplicationsFromFiles: begin`);
    const names = fs.readdirSync(getWorkingDirectory());
    const files = names
      .filter((name) => name.toLowerCase().endsWith('.application.json'))
      .map((name) => getFilePath(name));
    barId = createProgressIndicator(
      'determinate',
      files.length,
      'Importing applications...'
    );
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: ApplicationExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.managedApplication).length;
        total += count;
        await _importApplications(fileData, options);
        updateProgressIndicator(
          barId,
          `Imported ${count} application(s) from ${file}`
        );
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(
          barId,
          `Error importing application(s) from ${file}`
        );
        printMessage(error, 'error');
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error importing applications`, errors);
    }
    stopProgressIndicator(
      barId,
      `Finished importing ${total} application(s) from ${files.length} file(s).`
    );
    debugMessage(`cli.ApplicationOps.importApplicationsFromFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(barId, `Error importing applications`);
    printMessage(error, 'error');
  }
  return false;
}
