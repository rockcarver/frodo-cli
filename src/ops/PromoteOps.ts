import { frodo, FrodoError, state } from '@rockcarver/frodo-lib'
import { FullExportInterface, FullExportOptions } from '@rockcarver/frodo-lib/types/ops/ConfigOps';
import { printError, verboseMessage } from '../utils/Console';
import {
  getFullExportConfigFromDirectory,
} from '../utils/Config';
const { saveJsonToFile, saveTextToFile, getFilePath, getWorkingDirectory } = frodo.utils;
const { exportFullConfiguration } = frodo.config;
import { exportItem } from "./ConfigOps"

import deepDiff from 'deep-diff';
import * as fs from "fs"
import { promises } from "fs"
import * as path from "path"
import * as crypto from "crypto"

const exportDir = getWorkingDirectory(true) + "/frodo-export"

const changed = [];
const deleted = [];
const added = [];
const logmessages = [];

export async function compareExportToDirectory(
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: true,
    includeActiveValues: false,
    target: '',
  },
  dir: string,
): Promise<boolean> {
  try {
     var options = options
  //   var direct = dir
    //export the full configuration

    // console.log("exporting")
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
    let fileDiffname = 'fileDiff.config.json';
    compareDirectories(exportDir, dir)
    let compareObj: CompareObj = {added, changed, deleted}
    saveJsonToFile(compareObj, getFilePath(fileDiffname, true))
    saveJsonToFile(logmessages, getFilePath("a" + fileDiffname, true))
    
    return true;
  } catch (error) {
    printError(error);
    verboseMessage("Hello there we have an error!!!!!!!!!!!")
  }
  return false;
}

/**
 * Export everything to separate files
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 * @param {boolean} separateMappings separate sync.json mappings if true, otherwise keep them in a single file
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {FullExportOptions} options export options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEverythingToFiles(
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: false,
    includeActiveValues: false,
    target: '',
  },
  extract: boolean = true,
  separateMappings: boolean = false,
  includeMeta: boolean = false,
): Promise<boolean> {
  try {
    const collectErrors: Error[] = [];
    const exportData: FullExportInterface = await exportFullConfiguration(
      options,
      collectErrors
    );
    delete exportData.meta;
    const baseDirectory = exportDir;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.entries(exportData.global).forEach(([type, obj]: [string, any]) =>
      exportItem(
        exportData.global,
        type,
        obj,
        `${baseDirectory}/global`,
        includeMeta,
        extract,
        separateMappings
      )
    );
    Object.entries(exportData.realm).forEach(([realm, data]: [string, any]) =>
      Object.entries(data).forEach(([type, obj]: [string, any]) =>
        exportItem(
          data,
          type,
          obj,
          `${baseDirectory}/realm/${realm}`,
          includeMeta,
          extract,
          separateMappings
        )
      )
    );
    if (collectErrors.length > 0) {
      throw new FrodoError(`Errors occurred during full export`, collectErrors);
    }
    return true;
  } catch (error) {
    printError(error);
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

// Function to compare two directories
function compareDirectories(dir1, dir2) {
  // Walk through dir1
  const walkDir = (dir, callback) => {
      fs.readdirSync(dir).forEach(file => {
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

      if (relativePath.startsWith('.git' + path.sep) || relativePath.includes("README.md")) {
          return; // Skip .git directories
      }

      if (fs.existsSync(counterpart)) {
          const hash1 = hashFile(file);
          const hash2 = hashFile(counterpart);
          if (hash1 !== hash2) {
              changed.push(`'${relativePath}'`);
              changeFile(relativePath)
          }
      } else {
          deleted.push(`'${relativePath}'`);
          deleteFile(relativePath)
      }
  });

  // Second directory traversal to find added files
  walkDir(dir2, (file: string) => {
      const relativePath = path.relative(dir2, file);
      const counterpart = path.join(dir1, relativePath);

      if (relativePath.startsWith('.git' + path.sep) || relativePath.includes("README.md")) {
          return; // Skip .git directories
      }

      if (!fs.existsSync(counterpart)) {
          added.push(`'${relativePath}'`);
          addFile(relativePath)
      }
  });
}

async function emptyDirectory(dirPath: string): Promise<void> {
  const absoluteDirPath = path.resolve(dirPath)

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
  verboseMessage("cleaning: ")
  verboseMessage(files)

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

function changeFile(path: string) {
  logmessages.push("file changed:")
  console.log("file Changed: ")
  deleteFile(path, true)
  logmessages.push("then")
  console.log("then")
  addFile(path)
}

function addFile(path: string) {
  let type: string = path.substring(path.substring(0, path.lastIndexOf('/')).lastIndexOf('/') + 1, path.lastIndexOf('/'))

  switch (type) {
    case 'application': {
      logmessages.push(`add application ${path}`)
      console.log(`add application ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'authentication': {
      logmessages.push(`add authentication ${path}`)
      console.log(`add authentication ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'journey': {
      logmessages.push(`add journey ${path}`)
      console.log(`add journey ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'managedApplication': {
      logmessages.push(`add managedApplication ${path}`)
      console.log(`add managedApplication ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'policyset': {
      logmessages.push(`add policyset ${path}`)
      console.log(`add policyset ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'resourcetype': {
      logmessages.push(`add resourcetype ${path}`)
      console.log(`add resourcetype ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'script': {
      logmessages.push(`add script ${path}`)
      console.log(`add script ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'service': {
      logmessages.push(`add service ${path}`)
      console.log(`add service ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'theme': {
      logmessages.push(`add theme ${path}`)
      console.log(`add theme ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'emailTemplate': {
      logmessages.push(`add emailTemplate ${path}`)
      console.log(`add emailTemplate ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'idm': {
      logmessages.push(`add idm ${path}`)
      console.log(`add idm ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'secret': {
      logmessages.push(`add secret ${path}`)
      console.log(`add secret ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'sync': {
      logmessages.push(`add sync ${path}`)
      console.log(`add sync ${path}\n`)
      logmessages.push(" ")
      break;
    }
    case 'variable': {
      logmessages.push(`add variable ${path}`)
      console.log(`add variable ${path}\n`)
      logmessages.push(" ")
      break;
    }
    default: {
      logmessages.push(`add ${path}`)
      console.log(`add ${path}\n`)
      logmessages.push(" ")
      break;
    }
  }
}

function deleteFile(path: string, change: boolean = false) {
  let type: string = path.substring(path.substring(0, path.lastIndexOf('/')).lastIndexOf('/') + 1, path.lastIndexOf('/'))

  switch (type) {
    case 'application': {
      logmessages.push(`delete application ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete application ${path}\n`)
      } else {
        console.log(`delete application ${path}`)
      }
      break;
    }
    case 'authentication': {
      logmessages.push(`delete authentication ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete authentication ${path}\n`)
      } else {
        console.log(`delete authentication ${path}`)
      }
      break;
    }
    case 'journey': {
      logmessages.push(`delete journey ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete journey ${path}\n`)
      } else {
        console.log(`delete journey ${path}`)
      }
      break;
    }
    case 'managedApplication': {
      logmessages.push(`delete managedApplication ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete managedApplication ${path}\n`)
      } else {
        console.log(`delete managedApplication ${path}`)
      }
      break;
    }
    case 'policyset': {
      logmessages.push(`delete policyset ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete policyset ${path}\n`)
      } else {
        console.log(`delete policyset ${path}`)
      }
      break;
    }
    case 'resourcetype': {
      logmessages.push(`delete resourcetype ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete resourcetype ${path}\n`)
      } else {
        console.log(`delete resourcetype ${path}`)
      }
      break;
    }
    case 'script': {
      logmessages.push(`delete script ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete script ${path}\n`)
      } else {
        console.log(`delete script ${path}`)
      }
      break;
    }
    case 'service': {
      logmessages.push(`delete service ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete service ${path}\n`)
      } else {
        console.log(`delete service ${path}`)
      }
      break;
    }
    case 'theme': {
      logmessages.push(`delete theme ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete theme ${path}\n`)
      } else {
        console.log(`delete theme ${path}`)
      }
      break;
    }
    case 'emailTemplate': {
      logmessages.push(`delete emailTemplate ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete emailTemplate ${path}\n`)
      } else {
        console.log(`delete emailTemplate ${path}`)
      }
      break;
    }
    case 'idm': {
      logmessages.push(`delete idm ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete idm ${path}\n`)
      } else {
        console.log(`delete idm ${path}`)
      }
      break;
    }
    case 'secret': {
      logmessages.push(`delete secret ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete secret ${path}\n`)
      } else {
        console.log(`delete secret ${path}`)
      }
      break;
    }
    case 'sync': {
      logmessages.push(`delete sync ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete sync ${path}\n`)
      } else {
        console.log(`delete sync ${path}`)
      }
      break;
    }
    case 'variable': {
      logmessages.push(`delete variable ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete variable ${path}\n`)
      } else {
        console.log(`delete variable ${path}`)
      }
      break;
    }
    default: {
      logmessages.push(`delete ${path}`)
      if(!change){
        logmessages.push(" ")
        console.log(`delete ${path}\n`)
      } else {
        console.log(`delete ${path}`)
      }
      break;
    }
  }
}

interface CompareObj{ 
  added: string[],
  changed: string[],
  deleted: string[] 
}