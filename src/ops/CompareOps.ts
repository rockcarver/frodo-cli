import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import {
  FullExportInterface,
  FullExportOptions,
} from '@rockcarver/frodo-lib/types/ops/ConfigOps';
import * as crypto from 'crypto';
import deepDiff from 'deep-diff';
import * as fs from 'fs';
import { promises } from 'fs';
import * as path from 'path';

import { printError, verboseMessage } from '../utils/Console.js';

const {
  saveJsonToFile,
  getFilePath,
} = frodo.utils;
const { exportFullConfiguration } = frodo.config;

const changed = [];
const deleted = [];
const added = [];

export async function compareExportToDirectory(
  masterDir: string,
  exportDir: string,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: true,
    includeActiveValues: false,
    target: '',
  },
): Promise<boolean> {
  try {
    var options = options;
    verboseMessage(`Master dir: ${masterDir}`);
    verboseMessage(`Export dir: ${exportDir}`);
    // var direct = dir
    //export the full configuration

    // verboseMessage("exporting")
    // emptyDirectory(exportDir)
    // if(!await exportEverythingToFiles(options)){
    //   throw new FrodoError("Errors occured while exporting files")
    // }

    // let fileName = 'all.config.json';
    // verboseMessage("importing export")
    // const exportData = await getFullExportConfigFromDirectory(exportDir);
    // saveJsonToFile(exportData, getFilePath(fileName, true));

    // //import everything from separate files in a directory
    // // Todo: state.getDirectory changed over to a parameter passed in
    // verboseMessage("importing local dir")
    // const data = await getFullExportConfigFromDirectory(dir);
    // let filename2 = 'all2.config.json';
    // saveJsonToFile(data, getFilePath(filename2, true))
    // verboseMessage("Json diffing")
    // const diff = deepDiff.diff(data, exportData)
    // let jsonDiffname = 'jsonDiff.config.json';
    // if (diff) {
    //   verboseMessage("savingDiff")
    //   saveTextToFile(JSON.stringify(diff), getFilePath(jsonDiffname, true))
    // }

    verboseMessage("fileDiffing")
    await compareDirectories(exportDir, masterDir)
    let compareObj2: CompareObj = {added, changed, deleted}
    saveJsonToFile(compareObj2, getFilePath("b1" + "fileDiff.config.json", true))


     // while (added.length > 0) {
    //   added.pop()
    // }
    // while (changed.length > 0) {
    //   changed.pop()
    // }
    // while (deleted.length > 0) {
    //   deleted.pop()
    // }
    // emptyDirectory(exportDir)
    // if(!await exportEverythingToFiles(options)){
    //   throw new FrodoError("Errors occured while exporting files")
    // }

    // verboseMessage("fileDiffing")
    // await compareDirectories(exportDir, dir1)
    // let compareObj2: CompareObj = {added, changed, deleted}
    // saveJsonToFile(compareObj, getFilePath("b1" + fileDiffname, true))

    return true;
  } catch (error) {
    printError(error);
    verboseMessage('Hello there we have an error!!!!!!!!!!!');
  }
  return false;
}

// Function to hash a file using SHA-256
function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const fileData = fs.readFileSync(filePath);
  hash.update(fileData);
  return hash.digest('hex');
}

//Function to compare two directories
function compareDirectories(dir1, dir2) {
  // Walk through dir1
  const walkDir = (dir, callback) => {
    fs.readdirSync(dir).forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        walkDir(filePath, callback);
      } else {
        callback(filePath);
      }
    });
  };

  // First directory traversal
  walkDir(dir1, (file: string) => {
    const relativePath = path.relative(dir1, file);
    const counterpart = path.join(dir2, relativePath);

    if (
      relativePath.startsWith('.git' + path.sep) ||
      relativePath.includes('README.md')
    ) {
      return; // Skip .git directories
    }

    if (fs.existsSync(counterpart)) {
      const hash1 = hashFile(file);
      const hash2 = hashFile(counterpart);
      if (hash1 !== hash2) {
        changed.push(`'${relativePath}'`);
      }
    } else {
      deleted.push(`'${relativePath}'`);
    }
  });

  // Second directory traversal to find added files
  walkDir(dir2, (file: string) => {
    const relativePath = path.relative(dir2, file);
    const counterpart = path.join(dir1, relativePath);

    if (
      relativePath.startsWith('.git' + path.sep) ||
      relativePath.includes('README.md')
    ) {
      return; // Skip .git directories
    }

    if (!fs.existsSync(counterpart)) {
      added.push(`'${relativePath}'`);
    }
  });
}

async function emptyDirectory(dirPath: string): Promise<void> {
  const absoluteDirPath = path.resolve(dirPath);
  try {
    // Check if the directory exists
    await promises.access(absoluteDirPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('Directory does not exist:', absoluteDirPath);
      return;
    } else {
      throw err; // Some other error, rethrow it
    }
  }
  const files = await promises.readdir(absoluteDirPath);
  verboseMessage('cleaning: ');

  for (const file of files) {
    const filePath = path.join(absoluteDirPath, file);
    const stats = await promises.lstat(filePath);

    if (stats.isDirectory()) {
      // Recursively empty the directory
      await emptyDirectory(filePath);
      // Remove the directory itself
      await promises.rmdir(filePath);
    } else {
      // Remove the file
      await promises.unlink(filePath);
    }
  }
}

interface CompareObj {
  added: string[];
  changed: string[];
  deleted: string[];
}

function getJsonObjectTwoDown(filePath: string): any {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    const jsonObject = fileData[Object.keys(fileData)[0]];
    return jsonObject[Object.keys(jsonObject)[0]];
  } catch {
    console.error('error in json parsing');
  }
}

function getJsonObjectOneDown(filePath: string): any {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    return fileData[Object.keys(fileData)[0]];
  } catch {
    console.error('error in json parsing');
  }
}
