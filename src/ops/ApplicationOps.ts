import { frodo, state } from '@rockcarver/frodo-lib';
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
  failSpinner,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
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
export async function listApplications(long = false) {
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
  } catch (error) {
    printMessage(`Error listing applications - ${error}`, 'error');
  }
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
  let outcome = false;
  debugMessage(`cli.ApplicationOps.deleteApplication: begin`);
  showSpinner(`Deleting ${applicationName}...`);
  try {
    await _deleteApplicationByName(applicationName, deep);
    outcome = true;
    succeedSpinner(`Deleted ${applicationName}`);
  } catch (error) {
    failSpinner(`Error deleting ${applicationName}: ${error.message}`);
  }
  debugMessage(`cli.ApplicationOps.deleteApplication: end`);
  return outcome;
}

/**
 * Delete all applications
 * @param {boolean} deep deep delete (include dependencies)
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteApplications(deep: boolean): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.ApplicationOps.deleteApplications: begin`);
  showSpinner(`Deleting all applications...`);
  try {
    const deleted = await _deleteApplications(deep);
    outcome = true;
    succeedSpinner(`Deleted ${deleted.length} applications`);
  } catch (error) {
    failSpinner(`Error deleting applications: ${error.message}`);
  }
  debugMessage(`cli.ApplicationOps.deleteApplications: end`);
  return outcome;
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
  let outcome = false;
  debugMessage(`cli.ApplicationOps.exportApplicationToFile: begin`);
  showSpinner(`Exporting ${applicationName}...`);
  try {
    let fileName = getTypedFilename(applicationName, 'application');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await _exportApplicationByName(applicationName, options);
    saveJsonToFile(exportData, filePath, includeMeta);
    succeedSpinner(`Exported ${applicationName} to ${filePath}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting ${applicationName}: ${error.message}`);
  }
  debugMessage(`cli.ApplicationOps.exportApplicationToFile: end`);
  return outcome;
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
  let outcome = false;
  debugMessage(`cli.ApplicationOps.exportApplicationsToFile: begin`);
  showSpinner(`Exporting all applications...`);
  try {
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
    succeedSpinner(`Exported all applications to ${filePath}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting all applications`);
    printMessage(`${error.message}`, 'error');
  }
  debugMessage(`cli.ApplicationOps.exportApplicationsToFile: end [${outcome}]`);
  return outcome;
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
  const errors = [];
  let barId: string;
  try {
    const applications = await _readApplications();
    barId = createProgressIndicator(
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
        updateProgressIndicator(barId, `Exporting ${application.name}.`);
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
        updateProgressIndicator(barId, `Error exporting ${application.name}.`);
        stopProgressIndicator(
          fileBarId,
          `Error saving ${application.name} to ${file}.`
        );
      }
    }
    stopProgressIndicator(barId, `Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(barId, `Error exporting applications(s) to file(s)`);
  }
  debugMessage(`cli.ApplicationOps.exportApplicationsToFiles: end`);
  return 0 === errors.length;
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
  let outcome = false;
  debugMessage(`cli.ApplicationOps.importApplicationFromFile: begin`);
  showSpinner(`Importing ${applicationName}...`);
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await _importApplicationByName(applicationName, fileData, options);
    outcome = true;
    succeedSpinner(`Imported ${applicationName}.`);
  } catch (error) {
    failSpinner(`Error importing ${applicationName}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.ApplicationOps.importApplicationFromFile: end`);
  return outcome;
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
  let outcome = false;
  debugMessage(`cli.ApplicationOps.importFirstApplicationFromFile: begin`);
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await _importFirstApplication(fileData, options);
    outcome = true;
    succeedSpinner(`Imported ${filePath}.`);
  } catch (error) {
    failSpinner(`Error importing ${filePath}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.ApplicationOps.importFirstApplicationFromFile: end`);
  return outcome;
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
  let outcome = false;
  debugMessage(`cli.ApplicationOps.importApplicationsFromFile: begin`);
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const applicationData = JSON.parse(data);
    await _importApplications(applicationData, options);
    outcome = true;
    succeedSpinner(`Imported ${filePath}.`);
  } catch (error) {
    failSpinner(`Error importing ${filePath}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.ApplicationOps.importApplicationsFromFile: end`);
  return outcome;
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
    stopProgressIndicator(
      barId,
      `Finished importing ${total} application(s) from ${files.length} file(s).`
    );
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(
      barId,
      `Error importing application(s) from file(s).`
    );
    printMessage(error, 'error');
  }
  debugMessage(`cli.ApplicationOps.importApplicationsFromFiles: end`);
  return 0 === errors.length;
}
