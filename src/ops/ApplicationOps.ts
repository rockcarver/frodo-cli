import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type ApplicationExportInterface,
  type ApplicationExportOptions,
  type ApplicationImportOptions,
} from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { importItemsOfFile } from '../utils/ImportItems';
import { OperationRun } from '../utils/OperationRun';
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
  deleteApplication: _deleteApplication,
  deleteApplicationByName: _deleteApplicationByName,
  exportApplication: _exportApplication,
  exportApplicationByName: _exportApplicationByName,
  exportApplications: _exportApplications,
  importApplication: _importApplication,
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
 * @param {string | undefined} applicationId application id
 * @param {string | undefined} applicationName application name
 * @param {boolean} deep deep delete (include dependencies)
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteApplication(
  applicationId: string | undefined,
  applicationName: string | undefined,
  deep: boolean
): Promise<boolean> {
  const name = applicationName ?? applicationId;
  let spinnerId: string;
  try {
    debugMessage(`cli.ApplicationOps.deleteApplication: begin`);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Deleting ${name}...`
    );
    if (applicationId) {
      await _deleteApplication(applicationId, deep);
    } else {
      await _deleteApplicationByName(applicationName, deep);
    }
    stopProgressIndicator(spinnerId, `Deleted ${name}`, 'success');
    debugMessage(`cli.ApplicationOps.deleteApplication: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error deleting ${name}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete all applications
 * @param {boolean} deep deep delete (include dependencies)
 * @param {boolean} allowFailures true to report applications that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteApplications(
  deep: boolean,
  allowFailures = false
): Promise<boolean> {
  debugMessage(`cli.ApplicationOps.deleteApplications: begin`);
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Reading applications...`
  );
  try {
    const applications = await _readApplications();
    applications.sort((a, b) => a._id.localeCompare(b._id));
    stopProgressIndicator(
      spinnerId,
      `Successfully read ${applications.length} applications.`,
      'success'
    );
    const indicatorId = createProgressIndicator(
      'determinate',
      applications.length,
      `Deleting applications...`
    );
    const run = new OperationRun({ unit: 'application', allowFailures });
    for (const application of applications) {
      await run.run(application.name || application._id, async () => {
        await _deleteApplication(application._id, deep);
        updateProgressIndicator(
          indicatorId,
          `Deleted application ${application.name || application._id}`
        );
      });
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? `Some applications could not be deleted.`
        : `Deleted ${applications.length} applications.`,
      run.hasFailures ? 'fail' : 'success'
    );
    debugMessage(`cli.ApplicationOps.deleteApplications: end`);
    return run.finish();
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error deleting applications`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export application to file
 * @param {string | undefined} applicationId application id
 * @param {string | undefined} applicationName application name
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {ApplicationExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportApplicationToFile(
  applicationId: string | undefined,
  applicationName: string | undefined,
  file: string,
  includeMeta: boolean,
  options: ApplicationExportOptions = { useStringArrays: true, deps: true }
) {
  const name = applicationName ?? applicationId;
  let spinnerId: string;
  try {
    debugMessage(`cli.ApplicationOps.exportApplicationToFile: begin`);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Exporting ${name}...`
    );
    let fileName = getTypedFilename(name, 'application');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = applicationId
      ? await _exportApplication(applicationId, options)
      : await _exportApplicationByName(applicationName, options);
    saveJsonToFile(exportData, filePath, includeMeta);
    stopProgressIndicator(
      spinnerId,
      `Exported ${name} to ${filePath}.`,
      'success'
    );
    debugMessage(`cli.ApplicationOps.exportApplicationToFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error exporting ${name}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export all applications to file
 * One operation: the library reports the items it could not export in one combined error and returns no export
 * data then, so no file is written and the command fails (`--allow-failures` does not apply to a file that does not
 * exist). The printed error names the items.
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
 * Every application is exported on its own: an application that cannot be exported or saved does not stop the others,
 * one summary names the ones that could not be, and a failure to read the applications ends the command whatever
 * `--allow-failures` says.
 * @param {boolean} includeMeta true to include metadata, false otherwise
 * @param {ApplicationExportOptions} options export options
 * @param {boolean} allowFailures true to report applications that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportApplicationsToFiles(
  includeMeta: boolean,
  options: ApplicationExportOptions = { useStringArrays: true, deps: true },
  allowFailures = false
): Promise<boolean> {
  debugMessage(`cli.ApplicationOps.exportApplicationsToFiles: begin`);
  let totalBarId: string;
  try {
    const applications = await _readApplications();
    totalBarId = createProgressIndicator(
      'determinate',
      applications.length,
      'Exporting applications...'
    );
    const run = new OperationRun({ unit: 'application', allowFailures });
    for (const application of applications) {
      const fileBarId = createProgressIndicator(
        'determinate',
        1,
        `Exporting application ${application.name}...`
      );
      await run.run(application.name || application._id, async () => {
        let file = application.name;
        try {
          file = getFilePath(
            getTypedFilename(application.name, 'application'),
            true
          );
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
          updateProgressIndicator(
            totalBarId,
            `Error exporting ${application.name}.`
          );
          stopProgressIndicator(
            fileBarId,
            `Error saving ${application.name} to ${file}.`,
            'fail'
          );
          throw error;
        }
      });
    }
    stopProgressIndicator(
      totalBarId,
      run.hasFailures
        ? `Some applications could not be exported.`
        : `Export complete.`,
      run.hasFailures ? 'fail' : 'success'
    );
    debugMessage(`cli.ApplicationOps.exportApplicationsToFiles: end`);
    return run.finish();
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
 * @param {string | undefined} applicationId application id
 * @param {string | undefined} applicationName application name
 * @param {string} file file name
 * @param {ApplicationImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importApplicationFromFile(
  applicationId: string | undefined,
  applicationName: string | undefined,
  file: string,
  options: ApplicationImportOptions = { deps: true }
): Promise<boolean> {
  let spinnerId: string;
  const name = applicationName ?? applicationId;
  try {
    debugMessage(`cli.ApplicationOps.importApplicationFromFile: begin`);
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Exporting applications...`
    );
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    if (applicationId) {
      await _importApplication(applicationId, fileData, options);
    } else {
      await _importApplicationByName(applicationName, fileData, options);
    }
    stopProgressIndicator(spinnerId, `Imported ${name}`, 'success');
    debugMessage(`cli.ApplicationOps.importApplicationFromFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error importing ${name}`, 'fail');
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
 * Every application in the file is tried: one that cannot be imported is printed and named in one
 * summary, and the others are still imported. A file that cannot be read or parsed ends the command
 * whatever `--allow-failures` says.
 * @param {string} file file name
 * @param {ApplicationImportOptions} options import options
 * @param {boolean} allowFailures true to report applications that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importApplicationsFromFile(
  file: string,
  options: ApplicationImportOptions = { deps: true },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'application', allowFailures });
  debugMessage(`cli.ApplicationOps.importApplicationsFromFile: begin`);
  const filePath = getFilePath(file);
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing ${filePath}...`
  );
  let applicationData: ApplicationExportInterface;
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    applicationData = JSON.parse(data);
  } catch (error) {
    // not an item failure: the file that was named cannot be read
    stopProgressIndicator(spinnerId, `Error importing ${filePath}`, 'fail');
    printError(error);
    return false;
  }
  await importItemsOfFile(run, applicationData, {
    count: (data) => Object.keys(data.managedApplication).length,
    importItems: (data) => _importApplications(data, options),
    fallbackName: file,
  });
  const outcome = run.finish();
  stopProgressIndicator(
    spinnerId,
    outcome ? `Imported ${filePath}` : `Error importing ${filePath}`,
    outcome ? 'success' : 'fail'
  );
  debugMessage(`cli.ApplicationOps.importApplicationsFromFile: end`);
  return outcome;
}

/**
 * Import applications from files
 * Every file is tried: a file that cannot be read, or an application in it that cannot be imported,
 * is printed and named in one summary, and the others are still imported. A directory that cannot be
 * read ends the command whatever `--allow-failures` says.
 * @param {ApplicationImportOptions} options import options
 * @param {boolean} allowFailures true to report applications that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importApplicationsFromFiles(
  options: ApplicationImportOptions = { deps: true },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'application', allowFailures });
  debugMessage(`cli.ApplicationOps.importApplicationsFromFiles: begin`);
  let files: string[];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    files = names
      .filter((name) => name.toLowerCase().endsWith('.application.json'))
      .map((name) => getFilePath(name));
  } catch (error) {
    printError(error);
    return false;
  }
  const barId = createProgressIndicator(
    'determinate',
    files.length,
    'Importing applications...'
  );
  for (const file of files) {
    let fileData: ApplicationExportInterface;
    try {
      fileData = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      printError(error);
      run.recordFailure(path.basename(file), error);
      updateProgressIndicator(
        barId,
        `Error importing application(s) from ${file}`
      );
      continue;
    }
    await importItemsOfFile(run, fileData, {
      count: (data) => Object.keys(data.managedApplication).length,
      importItems: (data) => _importApplications(data, options),
      fallbackName: path.basename(file),
    });
    updateProgressIndicator(barId, `Imported application(s) from ${file}`);
  }
  const outcome = run.finish();
  stopProgressIndicator(
    barId,
    outcome
      ? `Finished importing application(s) from ${files.length} file(s).`
      : `Error importing applications`,
    outcome ? 'success' : 'fail'
  );
  debugMessage(`cli.ApplicationOps.importApplicationsFromFiles: end`);
  return outcome;
}
