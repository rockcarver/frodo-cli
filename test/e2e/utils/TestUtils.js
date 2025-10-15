import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import cp from 'child_process';
import tmp from 'tmp'

const exec = promisify(cp.exec);
const fspromise = fs.promises

const ansiEscapeCodes =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Remove ANSI escape codes
 * @param {string} text Text containing ANSI escape codes
 * @returns {string} Text without ANSI escape codes
 */
export function removeAnsiEscapeCodes(text) {
  return text ? text.replace(ansiEscapeCodes, '') : text;
}

const progressBarOutput =
  // eslint-disable-next-line no-control-regex
  /\[[-=]+].+\n+/g;

/**
 * Remove progress bar output, e.g.:
 * [========================================] 100% | 16/16 | Finished Importing Everything!
 * [========================================] 100% | 22/22 | Finished importing journeys
 * @param {string} text Text containing ANSI escape codes
 * @returns {string} Text without ANSI escape codes
 */
export function removeProgressBarOutput(text) {
  return text ? text.replace(progressBarOutput, '') : text;
}

/**
 * Method that runs an export command and tests that it was executed correctly.
 * @param {string} command The export command to run
 * @param {{env: Record<string, string>}} env The environment variables
 * @param {string} type The type of the file(s), e.g. script, idp, etc.
 * @param {string | undefined} fileName The file name if exporting a single file. Leave undefined if exporting (potentially) multiple files.
 * @param {string} directory The path to the directory the export files are located in. Default is the current directory "./".
 * @param checkForMetadata If true, ensures that metadata exists in each export. Default: true
 * @param checkStderr
 * @returns {Promise<void>}
 */
export async function testExport(
  command,
  env,
  type,
  fileName,
  directory = './',
  checkForMetadata = true,
  checkStderr = false
) {
  const isCurrentDirectory = directory === './' || directory === '.';
  let stdout;
  let stderr;
  let exitCode = 0;
  try {
    const output = await exec(command, env);
    stdout = output.stdout;
    stderr = output.stderr;
  } catch (e) {
    stdout = e.stdout;
    stderr = e.stderr;
    exitCode = e.code;
  }
  expect(exitCode).toMatchSnapshot();
  // console.error(`stdout:\n${stdout}`);
  // console.error(`stderr:\n${stderr}`);
  const regex = new RegExp(
    fileName
      ? fileName
      : type
        ? `.*\\.${type}\\.(json|js|groovy|xml)`
        : `.*\\.(json|js|groovy|xml)`
  );
  const filePaths = getFilePaths(directory, !isCurrentDirectory).filter((p) =>
    regex.test(p)
  );
  if (fileName) {
    // if (filePaths.length !== 0)
    //   console.error(`filePaths:\n${filePaths.join('\n')}`);
    expect(filePaths.length).toBe(1);
  } else {
    expect(filePaths.length >= 1).toBeTruthy();
  }
  expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  if (checkStderr) expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
  let deleteExportDirectory = true;
  filePaths.forEach((path) => {
    let deleteExportFile = true;
    if (path.endsWith('json')) {
      let exportData = {};
      try {
        exportData = JSON.parse(fs.readFileSync(path, 'utf8'));
      } catch (error) {
        deleteExportFile = false;
        deleteExportDirectory = false;
        exportData = { path, error };
      }
      if (checkForMetadata || exportData.meta) {
        expect(exportData).toMatchSnapshot(
          {
            meta: expect.any(Object),
          },
          path
        );
      } else {
        expect(exportData).toMatchSnapshot(path);
      }
    } else {
      const data = fs.readFileSync(path, 'utf8');
      expect(data).toMatchSnapshot(path);
    }
    //Delete export file
    if (deleteExportFile) {
      try {
        fs.unlinkSync(path);
      } catch (error) {
        // ignore for now, since this is only cleanup
      }
    }
  });
  if (!isCurrentDirectory && deleteExportDirectory)
    fs.rmdirSync(directory, {
      recursive: true,
    });
}

export const testif = (condition) => (condition ? test : test.skip);

/**
 * Gets the file paths of all files in the given directory.
 * @param {string} directoryPath The given base directory
 * @param {boolean} recursive If true, recursively gets file paths from sub-directories in the given directory. Default: false
 * @returns {string[]} The list of file paths
 */
function getFilePaths(directoryPath, recursive = false) {
  let paths = [];
  fs.readdirSync(directoryPath)
    .map((file) => path.join(directoryPath, file))
    .filter((filePath) => {
      // try/catch and safest possible fallback to stabilize highly parallelized test execution where the results of readdirSync are altered while being mapped/filtered/forEach-ed
      let isDirectory = false;
      try {
        isDirectory = fs.statSync(filePath).isDirectory();
      } catch (error) {
        // ignore
      }
      return recursive || !isDirectory;
    }) // Filter out directories if it is not recursive
    .forEach((filePath) => {
      // try/catch and safest possible fallback to stabilize highly parallelized test execution where the results of readdirSync are altered while being mapped/filtered/forEach-ed
      let isDirectory = false;
      try {
        isDirectory = fs.statSync(filePath).isDirectory();
      } catch (error) {
        // ignore
      }
      isDirectory
        ? (paths = paths.concat(getFilePaths(filePath, recursive)))
        : paths.push(filePath);
    });
  return paths;
}

export async function testPromote(
  sourceDir,
  modifiedFilesDir,
  referenceSubDirs,
  env, 
  name
) {
  env.env.FRODO_TEST_NAME = name
  const tempDir = await copyAndModifyDirectory(sourceDir, modifiedFilesDir, referenceSubDirs)
  const CMD = `frodo promote -M ${sourceDir} -E ${tempDir}`;
  const { stdout, stderr } = await exec(CMD, env);
  expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  expect(removeAnsiEscapeCodes(stderr)).toMatchSnapshot();
}

async function copyAndModifyDirectory(sourceDir, modifiedFilesDir, referenceSubDirs) {
  // Step 1: Create a temporary directory
  const tmpDir = tmp.dirSync().name;

  // Step 2: Copy the source directory to the temporary location
  await fspromise.cp(sourceDir, tmpDir, { recursive: true });
 
  // Step 3: Overwrite with modified files
  await fspromise.cp(modifiedFilesDir, tmpDir, { recursive: true });

  // Step 4: Delete files not present in modified files dir
  for (const referenceSubDir of referenceSubDirs) {
    await deleteFilesNotPresent(referenceSubDir, tmpDir, modifiedFilesDir)
  }
  // Step 5: Return the path to the temporary directory
  return tmpDir;
}

async function deleteFilesNotPresent(referenceSubDir, tmpDir, modifiedFilesDir) {
  // Step 4.1: Get a list of files in the reference directory of modifiedFilesDir
  const referenceDir = path.join(modifiedFilesDir, referenceSubDir);
  const referenceFiles = new Set(await getAllFiles(referenceDir, referenceDir));

  // Step 4.2: Delete files in tmpDir that aren’t in the referenceFiles list
  const targetDir = path.join(tmpDir, referenceSubDir);
  const targetFiles = await getAllFiles(targetDir, targetDir);

  for (const file of targetFiles) {
    if (!referenceFiles.has(file)) {
      const filePath = path.join(targetDir, file);
      await fspromise.rm(filePath);
    }
  }
}

// Helper function to get all file paths within a directory, relative to the base
async function getAllFiles(dir, base) {
  let files = [];
  const items = await fspromise.readdir(dir, { withFileTypes: true });
  
  for (const item of items) {
    const itemPath = path.join(dir, item.name);
    const relativePath = path.relative(base, itemPath);

    if (item.isDirectory()) {
      files = files.concat(await getAllFiles(itemPath, base));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

/**
 * Returns env for testing given connection info
 * @param connection The connection info
 * @returns {{env: {[p: string]: string | undefined, FRODO_SA_JWK: (string|(JwkInterface & {d: string, dp: string, dq: string, e: string, n: string, p: string, q: string, qi: string})|JwkRsa|*), TZ?: string, FRODO_HOST, FRODO_SA_ID: (string|string|*)}}} The env object
 */
export function getEnv(connection = undefined) {
  return {
    env: {
      ...process.env,
      // only add property if we have it
      ...(connection?.host && { FRODO_HOST: connection.host }),
      ...(connection?.saId && { FRODO_SA_ID: connection.saId }),
      ...(connection?.saJwk && { FRODO_SA_JWK: connection.saJwk }),
      ...(connection?.user && { FRODO_USERNAME: connection.user }),
      ...(connection?.pass && { FRODO_PASSWORD: connection.pass }), 
    },
  };
}
