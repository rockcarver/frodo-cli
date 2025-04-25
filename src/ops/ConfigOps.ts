import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import {
  FullExportInterface,
  FullExportOptions,
  FullGlobalExportInterface,
  FullImportOptions,
  FullRealmExportInterface,
} from '@rockcarver/frodo-lib/types/ops/ConfigOps';
import { SyncSkeleton } from '@rockcarver/frodo-lib/types/ops/MappingOps';
import { ScriptExportInterface } from '@rockcarver/frodo-lib/types/ops/ScriptOps';
import fs from 'fs';

import {
  getConfig,
  getFullExportConfig,
  getFullExportConfigFromDirectory,
} from '../utils/Config';
import { cleanupProgressIndicators, printError, verboseMessage } from '../utils/Console';
import { saveServersToFiles } from './classic/ServerOps';
import { ManagedSkeleton, writeManagedJsonToDirectory } from './IdmOps';
import { writeSyncJsonToDirectory } from './MappingOps';
import { extractScriptsToFiles } from './ScriptOps';


import {
  deleteAgent,
  deleteIdentityGatewayAgent,
  deleteJavaAgent,
  deleteWebAgent
} from './AgentOps';

import {
  deleteApplication
} from './ApplicationOps';
import {
  deleteVariableById,
} from './cloud/VariablesOps';
import {
  deleteConfigEntityById

} from './IdmOps';
import { deleteJourney } from './JourneyOps';
import { deleteMapping } from './MappingOps';
import {
  deleteOauth2ClientById,
  importOAuth2ClientFromFile,
} from './OAuth2ClientOps';
import { deletePolicyById } from './PolicyOps';
import {
  deleteResourceTypeUsingName,
  importResourceTypesFromFile
} from './ResourceTypeOps';
import { deleteScriptId, importScriptsFromFile } from './ScriptOps';
import { deleteService } from './ServiceOps.js';

import * as path from 'path';
import { deleteTheme } from './ThemeOps';
import { deletePolicySetById } from './PolicySetOps';
import { deleteServiceNextDescendents } from './ServiceOps.js';


const {
  getTypedFilename,
  saveJsonToFile,
  saveToFile,
  getFilePath,
  getWorkingDirectory,
  getRealmsForExport,
  getRealmUsingExportFormat,
  getMetadata
} = frodo.utils;
const { deleteDeepByKey } = frodo.utils.json;

const { exportFullConfiguration, importFullConfiguration } = frodo.config;
const { findOrphanedNodes, removeOrphanedNodes } = frodo.authn.node;

const logmessages = new Array<string>();

const ignoreList = [
  "global.agent",
  "global.authentication",
  "global.realm",
  "global.scripttype",
  "global.secretstore",
  "global.site",
  "realm.root-alpha.secretstore", //later might be promotable once export commmand is editted
  "realm.root-bravo.secretstore",
  "metadata",
  "lastModifiedDate",
  "lastModifiedBy",
  "global.server",
  "meta.exportDate",
  "meta.exportTool",
  "meta.exportToolVersion",
  "meta.exportedBy",
  "meta.origin",
  "meta.originAmVersion",
  "createdBy",
  "creationDate"
]

const priorityList = [
  ["realm", "service"],
  ["realm", "trees"],
  ["realm", "policy"],
  ["realm", "policyset"],
  ["realm", "application"],
  ["realm", "idp"],
  ["realm", "saml"],
  ["realm", "saml/cot"],
  ["realm", "resourcetype"],
  ["realm", "agent"],
  ["realm", "theme"],
  ["realm", "script"],
  ["global.service"],
  ["global.mapping"],
  ["global.sync"],
  ["global.emailTemplate"],
  ["global.idm"],
  ["global.variable"],
  ["global.secret"],
]


/**
 * Export everything to separate files
 * @param {String} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {FullExportOptions} options export options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEverythingToFile(
  file: string,
  includeMeta: boolean,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: false,
    includeDefault: false,
    includeActiveValues: false,
    target: '',
    includeReadOnly: false,
    onlyRealm: false,
    onlyGlobal: false,
  }
): Promise<boolean> {
  try {
    const collectErrors: Error[] = [];
    const exportData = await exportFullConfiguration(options, collectErrors);
    let fileName = 'all.config.json';
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    if (collectErrors.length > 0) {
      throw new FrodoError(`Errors occurred during full export`, collectErrors);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export everything to separate files
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 * @param {boolean} separateMappings separate sync.idm.json mappings if true, otherwise keep them in a single file
 * @param {boolean} separateObjects separate managed.idm.json objects if true, otherwise keep them in a single file
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {FullExportOptions} options export options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEverythingToFiles(
  extract: boolean = false,
  separateMappings: boolean = false,
  separateObjects: boolean = false,
  includeMeta: boolean = true,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: false,
    includeActiveValues: false,
    target: '',
    includeReadOnly: false,
    onlyRealm: false,
    onlyGlobal: false,
  }
): Promise<boolean> {

  try {
    const collectErrors: Error[] = [];

    const exportData: FullExportInterface = await exportFullConfiguration(
      options,
      collectErrors
    );

    delete exportData.meta;
    const baseDirectory = getWorkingDirectory(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.entries(exportData.global).forEach(([type, obj]: [string, any]) =>
      exportItem(
        exportData.global,
        type,
        obj,
        `${baseDirectory}/global`,
        includeMeta,
        extract,
        separateMappings,
        separateObjects
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
          separateMappings,
          separateObjects
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

/**
 * Export item
 * @param {FullExportInterface} exportData the export data
 * @param {string} type the type of export data
 * @param {any} obj the export data for the given item
 * @param {string} baseDirectory the baseDirectory to export to
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 * @param {boolean} separateMappings separate sync.idm.json mappings if true, otherwise keep them in a single file
 * @param {boolean} separateObjects separate managed.idm.json objects if true, otherwise keep them in a single file
 */
export function exportItem(
  exportData,
  type,
  obj,
  baseDirectory,
  includeMeta,
  extract,
  separateMappings = false,
  separateObjects = false
) {
  if (!obj || !Object.keys(obj).length) {
    return;
  }
  let fileType = type;
  if (fileType === 'managedApplication') {
    fileType = 'application';
  } else if (fileType === 'application') {
    fileType = 'oauth2.app';
  } else if (fileType === 'trees') {
    fileType = 'journey';
  }
  if (!fs.existsSync(`${baseDirectory}/${fileType}`)) {
    fs.mkdirSync(`${baseDirectory}/${fileType}`, {
      recursive: true,
    });
  }
  if (type === 'saml') {
    const samlData = {
      saml: {
        cot: {},
        hosted: {},
        metadata: {},
        remote: {},
      },
    };
    if (obj.cot && Object.keys(obj.cot).length) {
      if (!fs.existsSync(`${baseDirectory}/cot`)) {
        fs.mkdirSync(`${baseDirectory}/cot`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(obj.cot).forEach(([id, value]: [string, any]) => {
        samlData.saml.cot = {
          [id]: value,
        };
        saveJsonToFile(
          samlData,
          `${baseDirectory}/cot/${getTypedFilename(id, 'cot.saml')}`,
          includeMeta
        );
      });
      samlData.saml.cot = {};
    }
    Object.entries(obj.hosted)
      .concat(Object.entries(obj.remote))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .forEach(([id, value]: [string, any]) => {
        const filename = getTypedFilename(
          value.entityId ? value.entityId : id,
          fileType
        );
        const samlType = obj.hosted[id] ? 'hosted' : 'remote';
        samlData.saml[samlType][id] = value;
        samlData.saml.metadata = {
          [id]: obj.metadata[id],
        };
        saveJsonToFile(
          samlData,
          `${baseDirectory}/${fileType}/${filename}`,
          includeMeta
        );
        samlData.saml[samlType] = {};
      });
    if (!fs.readdirSync(`${baseDirectory}/${fileType}`).length) {
      fs.rmdirSync(`${baseDirectory}/${fileType}`);
    }
  } else if (type === 'authentication') {
    const fileName = getTypedFilename(
      `${baseDirectory.substring(baseDirectory.lastIndexOf('/') + 1)}`,
      'authentication.settings'
    );
    saveJsonToFile(
      {
        authentication: obj,
      },
      `${baseDirectory}/${fileType}/${fileName}`,
      includeMeta
    );
  } else if (type === 'sync') {
    writeSyncJsonToDirectory(
      obj as SyncSkeleton,
      `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}`,
      includeMeta
    );
  } else if (type === 'server') {
    saveServersToFiles(
      obj,
      undefined,
      `${baseDirectory}/${fileType}`,
      extract,
      includeMeta
    );
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.entries(obj).forEach(([id, value]: [string, any]) => {
      if (type === 'idm') {
        if (value != null) {
          if (separateMappings && id === 'sync') {
            writeSyncJsonToDirectory(
              value as SyncSkeleton,
              `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}/sync`,
              includeMeta
            );
          } else if (separateObjects && id === 'managed') {
            writeManagedJsonToDirectory(
              value as ManagedSkeleton,
              `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}/managed`,
              includeMeta
            );
          } else {
            const filename = `${id}.idm.json`;
            if (filename.includes('/')) {
              fs.mkdirSync(
                `${baseDirectory}/${fileType}/${filename.slice(
                  0,
                  filename.lastIndexOf('/')
                )}`,
                {
                  recursive: true,
                }
              );
            }
            saveToFile(
              'idm',
              value,
              '_id',
              `${baseDirectory}/${fileType}/${filename}`,
              includeMeta
            );
          }
        }
      } else {
        let name =
          value && value.name && type !== 'emailTemplate'
            ? value.name
            : undefined;
        if (type === 'realm') {
          if (!name || name === '/') {
            name = 'root';
          } else {
            name = (value.parentPath.substring(1) + name).replaceAll('/', '-');
          }
        }
        const filename = getTypedFilename(
          // Server information has an id of *, which is not an allowed file name character in windows
          name ? name : id === '*' ? 'information' : id,
          fileType
        );
        if (extract && type === 'script') {
          extractScriptsToFiles(
            exportData as ScriptExportInterface,
            id,
            `${baseDirectory.substring(getWorkingDirectory(false).length + 1)}/${fileType}`
          );
        }
        if (!fs.existsSync(`${baseDirectory}/${fileType}`)) {
          fs.mkdirSync(`${baseDirectory}/${fileType}`);
        }
        saveJsonToFile(
          {
            [type]: {
              [id]: value,
            },
          },
          `${baseDirectory}/${fileType}/${filename}`,
          includeMeta
        );
      }
    });
  }
}

/**
 * Import everything from a single file
 * @param {string} file The file path
 * @param {FullImportOptions} options import options
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importEverythingFromFile(
  file: string,
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    includeDefault: false,
    includeActiveValues: false,
    source: '',
  }
): Promise<boolean> {
  try {
    const data = await getFullExportConfig(file);
    const collectErrors: Error[] = [];
    await importFullConfiguration(data, options, collectErrors);
    if (collectErrors.length > 0) {
      throw new FrodoError(
        `Errors occurred during full config import`,
        collectErrors
      );
    }
    return true;
  } catch (error) {
    cleanupProgressIndicators();
    printError(error);
  }
  return false;
}

/**
 * Import everything from separate files
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importEverythingFromFiles(
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    includeDefault: false,
    includeActiveValues: false,
    source: '',
  }
): Promise<boolean> {
  try {
    const data = await getFullExportConfigFromDirectory(getWorkingDirectory());
    const collectErrors: Error[] = [];
    await importFullConfiguration(data, options, collectErrors);
    if (collectErrors.length > 0) {
      throw new FrodoError(
        `Errors occurred during full config import`,
        collectErrors
      );
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}






export async function importEntityfromFile(
  file: string,
  global = false,
  options: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    includeDefault: false,
    includeActiveValues: false,
    source: '',
  }
): Promise<boolean> {
  try {
    const data = {
      global: {},
      realm: {},
    } as FullExportInterface;
    if (global) {
      await getConfig(
        data.global as FullGlobalExportInterface,
        file,
        undefined
      );
    } else {
      const currentRealm =
        (state.getRealm().startsWith('/') ? '' : '/') + state.getRealm();
      const realm = (await getRealmsForExport()).find(
        (r) => getRealmUsingExportFormat(r) === currentRealm
      );
      if (!realm) {
        throw new FrodoError(
          `Unable to find the realm '${currentRealm}' in deployment. Unable to proceed with import`
        );
      }
      data.realm[realm] = {} as FullRealmExportInterface;
      await getConfig(data.realm[realm], file, undefined);
    }
    const collectErrors: Error[] = [];
    const imports = await importFullConfiguration(data, options, collectErrors);
    if (collectErrors.length > 0) {
      throw new FrodoError(
        `Error occurred during config import`,
        collectErrors
      );
    }
    if (imports.length === 0) {
      throw new FrodoError(`No imports were made`);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}



/**
 * This function changes a keypath to an object. 
 * @param str 
 * @param o 
 * @returns 
 */
function makeObject(strArr: string[], o: any): any {
  let obj = o;
  for (const s of strArr) {
    obj = obj[s];
  }
  return obj;
}

/**
 * Save an object to a txt file. 
 * @param obj 
 * @param filePath 
 * @param encoding text encoding (default: utf8)
 */
function toText(obj: any, filePath: string): void {
  const formattedText = JSON.stringify(obj, null, 2);
  fs.writeFileSync(filePath, formattedText, 'utf8');
}


/**
 * Import Master config data to the cloud
 * @param master 
 * @param options 
 * @returns 
 */
export async function importMasterToCloud(master: any, options: FullImportOptions): Promise<boolean> {
  try {
    verboseMessage("importMasterToCloud function in ");
    const collectErrors: Error[] = [];
    await importFullConfiguration(master, options, collectErrors);
    if (collectErrors.length > 0) {
      throw new FrodoError(
        `Errors occurred during full config import`,
        collectErrors
      );
    }
    return true;
  } catch (error) {
    cleanupProgressIndicators();
    printError(error);
  }
  return false;
}

/**
 * 
 * @param fullConfig orphan full config object 
 * @param orphan orphan object to run recursively 
 * @param master master object to run recursively 
 * @param currentPath 
 * @param result string[] of the keys that are something has added on orphan(tenant). 
 * @returns 
 */
export async function compareConfigDeep(
  fullConfig: any,
  orphan: any,
  master: any,
  currentPath: string[] = [],
  result: string[] = [],
): Promise<string[]> {
  const currentPathStr = currentPath.join('.');
  const isGlobal = currentPath[0] === 'global'

  if (
    typeof orphan === 'object' &&
    orphan !== null &&
    typeof master === 'object' &&
    master !== null
  ) {
    if (Array.isArray(orphan) && Array.isArray(master)) {
      const length = Math.max(orphan.length, master.length);
      for (let i = 0; i < length; i++) {
        const newPath = [...currentPath, i.toString()];
       await compareConfigDeep(fullConfig, orphan[i], master[i], newPath, result);
      }
    } else {
      for (const key of Object.keys(orphan)) {
        const newPath = [...currentPath, key];
       await compareConfigDeep(fullConfig, orphan[key], master[key], newPath, result);
      }
    }
  } else {
    const normalizedOrphan = currentPathStr.endsWith('script') ? normalizeScriptValue(orphan) : orphan;
    const normalizedMaster = currentPathStr.endsWith('script') ? normalizeScriptValue(master) : master;

    if (normalizedOrphan !== normalizedMaster) {
      if (!ignoreList.some(ignored => currentPathStr.includes(ignored))) {
        if (!shouldIgnore(fullConfig, currentPath, isGlobal)) {
          result.push(currentPathStr);
        }
      }
    }
  }
  return result;
}

function normalizeScriptValue(value: any): string {
  if (Array.isArray(value)) {
    return value.join('\n');
  }
  if (typeof value === 'string') {
    return value;
  }
  return value;
}


function isEmptyObject(value: any): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}
 function shouldIgnore(config, strArr, isGlobal):boolean {
  if (isGlobal) {
    if (strArr.length === 2 && (isEmptyObject(makeObject(strArr, config)))) {
      return true
    }
    else {
      return false
    }
  }
  else {
    if (strArr.length === 3 && (isEmptyObject(makeObject(strArr, config)))) {
      return true
    }
    else {
      return false
    }
  }
}
async function trimCompareResult(items: string[]): Promise<string[]> {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const prefix = getEntityPrefix(item);
    if (!seen.has(prefix)) {
      seen.add(prefix);
      result.push(prefix);
    }
  }

  return result;
}

async function sortTrimResult(items: string[], keywordCombos: string[][]): Promise<string[]> {
  return [...items].sort((a, b) => {
    const aIndex = findComboIndex(a, keywordCombos);
    const bIndex = findComboIndex(b, keywordCombos);
    return aIndex - bIndex;
  });
}

function findComboIndex(item: string, combos: string[][]): number {
  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i];
    const matchedAll = combo.every(keyword =>
      item.toLowerCase().includes(keyword.toLowerCase())
    );
    if (matchedAll) return i;
  }
  return combos.length; 
}


function getEntityPrefix(path: string): string {
  const parts = path.split('.');
  if (parts[0] === 'global' && parts[1] !== 'sync') {
    return parts.slice(0, 3).join('.'); // global.service.dashboard
  }
  else {
    return parts.slice(0, 4).join('.'); // realm.root-alpha.secretstore.config
  }
  return path;
}


/**
 * in the string of keypath, it will return the type
 * @param str keypath
 * @returns Coinfig type 
 */
function getType(str: string, isGlobal: boolean): string {
  const parts = str.split('.');
  let type = ''
  if (isGlobal) {
    type = parts[1]
  }
  else {
    type = parts[2]
  }

  if (type == 'trees') {
    type = 'journey';
  }
  else if (type == 'emailTemplate') {
    type = 'idm';
  }
  verboseMessage(`Entity type detected: ${type}`)
  return type
}

/**
 * 
 * @param str String of keypath
 * @returns returns the last key only in string. 
 */
function getName(str: string, isGlobal: boolean): string {
  const parts = str.split('.');
  let name = '';
  if (isGlobal) {
    name = parts[2]
  }
  else {
    name = parts[3]
  }

  return name
}
function getObjectAtKey(key: string, isGlobal: boolean, o): any {
  const splited = key.split('.')
  let obj = o;
  let depth = 4;
  if (isGlobal && !key.includes('sync.mappings')) {
    depth = 3;
  }
  else {
    depth = 4;

  }
  for (let i = 0; i < depth; i++) {
    obj = obj[splited[i]]
  }
  return obj;
}


/**
 * Sets the realm for the next command to run on.
 * @param path sub-path to the config file currently being looked at
 * @param inRealm if the object is in a realm or not
 */
function setRealm(key: string, type: string, inRealm: boolean) {
  if (inRealm) {
    let parts = key.split('.');
    let realm = parts[1];
    verboseMessage(`realm right before setRealm = ${realm}`)
    if (realm === 'root') {
      realm = '/';
    }
    realm = realm.replace('root-', '').replaceAll('-', '/');
    if (type != 'theme') {
      realm = '/' + realm
    }
    state.setRealm(realm);
    verboseMessage(`realm right after setRealm = ${realm}`)
  }

}

/**
 * delete stuff from cloud
 * @param objectMap 
 * @param effectSecrets 
 * @param orphan 
 * @returns 
 */
export async function deleteFromCloud(
  keyString: string[],
  effectSecrets: boolean,
  orphan: any
): Promise<boolean> {

  try {
    verboseMessage("deleteFromCloud function in -------- ")
    for (const key of keyString) {

      const isGlobal = key.substring(0, key.indexOf('.')) === 'global';
      const inRealm = key.substring(0, key.indexOf('.')) === 'realm';
      const currentName = getName(key, isGlobal);
      verboseMessage(`inRealm is =  ${inRealm}`);
      const type = getType(key, isGlobal);
      const keyObject = getObjectAtKey(key, isGlobal, orphan)
      setRealm(key, type, inRealm);


      switch (type) {
        case 'application': {
          const application = keyObject;
          logmessages.push(`delete application with id ${application._id}`);
          verboseMessage(`delete application with id ${application._id}`);
          const outcome = await deleteOauth2ClientById(application._id);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          break;
        }
        case 'authentication': {
          logmessages.push(`no delete exitsts for authentication`);
          logmessages.push(`delete authentication ${key}`);
          logmessages.push(' ');
          verboseMessage(`no delete exitsts for authentication`);
          verboseMessage(`delete authentication ${key}\n`);
          break;
        }
        case 'journey': {
          const journeyId = currentName;
          verboseMessage(
            `Deleting journey ${journeyId} in realm "${state.getRealm()}"...`
          );
          const outcome = await deleteJourney(journeyId, {
            deep: true,
            verbose: false,
            progress: false,
          });
          logmessages.push(`delete journey ${key}`);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          verboseMessage(`delete journey ${key}\n`);
          verboseMessage(
            `Pruning orphaned configuration artifacts in realm "${state.getRealm()}"...`
          );
          try {
            const orphanedNodes = await findOrphanedNodes();
            if (orphanedNodes.length > 0) {
              await removeOrphanedNodes(orphanedNodes);
            } else {
              verboseMessage('No orphaned nodes found.');
            }
          } catch (error) {
            printError(error);
            process.exitCode = 1;
          }
          break;
        }
        case 'managedApplication': {
          const managedApplication = keyObject;
          verboseMessage(
            `Deleting Managed Application with name ${managedApplication.name}`
          );
          const outcome = await deleteApplication(managedApplication.name, false);
          logmessages.push(`delete managedApplication ${managedApplication.name}`);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          verboseMessage(`delete managedApplication ${key}\n`);
          break;
        }
        case 'resourcetype': {
          const resourcetype = keyObject;
          verboseMessage(
            `Deleting authorization resource type ${resourcetype.name}`
          );
          const outcome = await deleteResourceTypeUsingName(resourcetype.name);
          logmessages.push(`delete resourcetype ${key}`);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          verboseMessage(`delete resourcetype ${key}\n`);
          break;
        }
        case 'script': {
          const script = keyObject;
          verboseMessage(
            `Deleting script ${script._id} in realm "${state.getRealm()}"...`
          );
          const outcome = await deleteScriptId(script._id);
          logmessages.push(`delete script ${key}`);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          verboseMessage(`delete script ${key}\n`);
          break;
        }
        case 'service': {
          const serviceId = currentName;
          if (isGlobal) { //if the service is global.service, it only deletes the descendents
            verboseMessage(`service Id: ${serviceId}`);
            const outcome = await deleteServiceNextDescendents(serviceId, isGlobal);
            logmessages.push(`delete service ${key}`);
            logmessages.push(`outcome: ${outcome}`);
            logmessages.push(' ');
            verboseMessage(`delete service ${key}\n`);
            break;
          }
          else {
            verboseMessage(`service Id: ${serviceId}`);
            const outcome = await deleteService(serviceId, isGlobal);
            logmessages.push(`delete service ${key}`);
            logmessages.push(`outcome: ${outcome}`);
            logmessages.push(' ');
            verboseMessage(`delete service ${key}\n`);
            break;
          }
        }
        // Taken care of by Idm
        case 'theme': {
          const themeName = currentName;
          verboseMessage(`delete theme with theme Id: ${themeName}`);
          logmessages.push(`delete theme with theme Id: ${themeName}`);
          const outcome = await deleteTheme(themeName);
          logmessages.push(`No delete written for theme`);
          logmessages.push(`delete theme ${key}`);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          verboseMessage(`delete theme ${key}\n`);
          break;
        }
        // Taken care of by the Idm config
        case 'emailTemplate': {
          break;
        }
        case 'idm': {

          const entityId = keyObject._id;
          verboseMessage(`delete Idm config with entity Id: ${entityId}`);
          logmessages.push(`delete Idm config with entity Id: ${entityId}`);
          const outcome = await deleteConfigEntityById(entityId);
          logmessages.push(`No delete written for idm`);
          logmessages.push(`delete idm ${entityId}`);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          verboseMessage(`delete idm ${key}\n`);
          break;
        }
        // todo: Currently secrets when exported are hashed so it needs to be thought of more
        case 'secret': {
          if (effectSecrets) {
            const secret = keyObject;
            verboseMessage("Currently secrets when exported are hashed so it needs to be thought of more")
          }
          break;
        }
        case 'sync': {
          const sync = keyObject;
          verboseMessage(`sync Id: ${sync._id}`);
          const outcome = await deleteMapping(sync._id);
          logmessages.push(`delete sync ${key}`);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          verboseMessage(`delete sync ${key}\n`);
          break;
        }
        case 'variable': {
          if (effectSecrets) {
            const variable = keyObject
            verboseMessage(`Deleting variable with id: ${variable._id}`);
            const outcome = await deleteVariableById(variable._id);
            logmessages.push(`delete variable ${key}`);
            logmessages.push(`outcome: ${outcome}`);
            logmessages.push(' ');
            verboseMessage(`delete variable ${key}\n`);
          }
          else {
            verboseMessage("Include active value flag is set to false, so we are not deleting variables.")
          }
          break;
        }
        case 'mapping': {
          const mapping = keyObject
          verboseMessage(`mapping Id: ${mapping._id}`);
          const outcome = await deleteMapping(mapping._id);
          logmessages.push(`delete mapping ${key}`);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          verboseMessage(`delete mapping ${key}\n`);
          break;
        }
        case 'agent': {
          const agent = keyObject;
          const agentType = agent._type._id;
          verboseMessage(
            `Deleting agent '${agent._id}' of type ${agentType} in realm "${state.getRealm()}"...`
          );
          switch (agentType) {
            case 'WebAgent': {
              const outcome = await deleteWebAgent(agent._id);
              logmessages.push(`delete WebAgent ${key}`);
              logmessages.push(`outcome: ${outcome}`);
              verboseMessage(`delete agents ${key}\n`);
              break;
            }
            case 'IdentityGatewayAgent': {
              const outcome = await deleteIdentityGatewayAgent(agent._id);
              logmessages.push(`delete IdentityGatewayAgent ${key}`);
              logmessages.push(`outcome: ${outcome}`);
              verboseMessage(`delete agents ${key}\n`);
              break;
            }
            case 'J2EEAgent': {
              const outcome = await deleteJavaAgent(agent._id);
              logmessages.push(`delete IdentityGatewayAgent ${key}`);
              logmessages.push(`outcome: ${outcome}`);
              verboseMessage(`delete agents ${key}\n`);
              break;
            }
            default: {
              const outcome = await deleteAgent(agent._id);
              logmessages.push(`delete agents ${key}`);
              logmessages.push(`outcome: ${outcome}`);
              verboseMessage(`delete agents ${key}\n`);
              break;
            }
          }
          logmessages.push(' ');
          break;
        }
        // When an idp object is modified so is a service file, by changing the service config it will also
        // change the idp config.
        case 'idp': {
          break;
        }
        case 'policy': {
          const policy = keyObject;
          verboseMessage(`policy id: ${policy._id}`);
          const outcome = await deletePolicyById(policy._id);
          logmessages.push(`delete policy ${key}`);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          verboseMessage(`delete policy ${key}\n`);
          break;
        }
        // These next three object types have deletes written for them, but they are not promotable so we don't worry about effecting them
        case 'cot': {
          break;
        }
        case 'policyset': {
          const policyset = currentName
          verboseMessage(`policy set Id: ${policyset}`);
          const outcome = await deletePolicySetById(policyset);
          logmessages.push(`delete policy set ${key}`);
          logmessages.push(`outcome: ${outcome}`);
          logmessages.push(' ');
          verboseMessage(`delete policy set ${key}\n`);
          break;
        }
        case 'saml': {
          break;
        }
        default: {
          logmessages.push(
            `No delete ${key} not setup for type ${type}`
          );
          logmessages.push(' ');
          verboseMessage(
            `No delete ${key} not setup for type ${type}\n`
          );
          break;
        }
      }
    }
  } catch (error) {
    printError(error);
  }
  return false;
}


/**
 * Export from current tenant, compare with master file, delete the differences and import master back 
 */
export async function compareWithMasterFileAndDeleteFromCloud(
  masterFile: string,
  dryRun: boolean,
  exportOptions: FullExportOptions = {
    useStringArrays: false,
    noDecode: false,
    coords: false,
    includeDefault: undefined,
    includeActiveValues: undefined,
    target: undefined,
    includeReadOnly: undefined,
    onlyRealm: undefined,
    onlyGlobal: undefined,
  },
  importOptions: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    includeDefault: false,
    includeActiveValues: false,
    source: '',
  }
): Promise<boolean> {
  try {
    const collectErrors: Error[] = [];
    const exportData = await exportFullConfiguration(exportOptions, collectErrors);
    delete exportData.meta
    deleteDeepByKey(exportData, '_rev');



    const rawData = fs.readFileSync(path.resolve(masterFile), 'utf8');
    const masterConfig = JSON.parse(rawData);

    saveJsonToFile(exportData, './compareResult/orphanFile.json')
    saveJsonToFile(masterConfig, './compareResult/masterFile.json')
    
    const compareResult = await compareConfigDeep(exportData, exportData, masterConfig);
    const trimResult = await trimCompareResult(compareResult);
    const sortResult = await sortTrimResult(trimResult, priorityList);
    verboseMessage(`Result after comparison ${compareResult}`)
    verboseMessage(`Result after triming and sorting ${sortResult}`)

    toText(compareResult, './compareResult/compareResult.txt');
    toText(sortResult, './compareResult/sortTrimResult.txt');

    if (!dryRun) {
      verboseMessage("dry run is false, so it will prompt to delete from cloud ")
      await deleteFromCloud(sortResult, importOptions.includeActiveValues, exportData)
      verboseMessage("Dry run is false so it will promt to import master to cloud ")
      await importMasterToCloud(masterConfig, importOptions);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export from current tenant, compare with master directory, delete the differences and import master back 
 */
export async function compareWithMasterDirectoryAndDeleteFromCloud(
  dryRun: boolean,
  exportOptions: FullExportOptions = {
    useStringArrays: false,
    noDecode: false,
    coords: false,
    includeDefault: undefined,
    includeActiveValues: undefined,
    target: undefined,
    includeReadOnly: undefined,
    onlyRealm: undefined,
    onlyGlobal: undefined,

  },
  importOptions: FullImportOptions = {
    reUuidJourneys: false,
    reUuidScripts: false,
    cleanServices: false,
    includeDefault: false,
    includeActiveValues: false,
    source: '',
  }
): Promise<boolean> {
  try {
    const collectErrors: Error[] = [];
    const exportData = await exportFullConfiguration(exportOptions, collectErrors);

    delete exportData.meta
    deleteDeepByKey(exportData, '_rev');

    const masterConfig = await getFullExportConfigFromDirectory(getWorkingDirectory());

    saveJsonToFile(exportData, './compareResult/orphanFile.json')
    saveJsonToFile(masterConfig, './compareResult/masterFile.json')

    const compareResult = await compareConfigDeep(exportData, exportData, masterConfig);
    const trimResult = await trimCompareResult(compareResult);
    const sortResult = await sortTrimResult(trimResult, priorityList);    // let detailed: Record<string, object> = {} ;
    verboseMessage(`Result after comparison ${compareResult}`)
    verboseMessage(`Result after triming and sorting ${sortResult}`)

    toText(compareResult, './compareResult/compareResult.txt');
    toText(sortResult, './compareResult/sortTrimResult.txt');


    if (!dryRun) {
      verboseMessage("dry run is false, so it will prompt to delete from cloud ")
      await deleteFromCloud(sortResult, importOptions.includeActiveValues, exportData)
      verboseMessage("Dry run is false so it will promt to import master to cloud ")
      await importMasterToCloud(masterConfig, importOptions);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}



