import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import {
  FullExportInterface,
  FullExportOptions,
} from '@rockcarver/frodo-lib/types/ops/ConfigOps';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import yesno from 'yesno';

import { printError, verboseMessage } from '../utils/Console';
import {
  deleteAgent,
  deleteIdentityGatewayAgent,
  deleteJavaAgent,
  deleteWebAgent,
  importAgentFromFile,
  importIdentityGatewayAgentFromFile,
  importJavaAgentFromFile,
  importWebAgentFromFile,
} from './AgentOps';
import {
  deleteApplication,
  importApplicationsFromFile,
} from './ApplicationOps';
import { importAuthenticationSettingsFromFile } from './AuthenticationSettingsOps';
import {
  deleteVariableById,
  importVariableFromFile,
} from './cloud/VariablesOps';
import { exportItem } from './ConfigOps';
import { importEmailTemplateFromFile } from './EmailTemplateOps';
import {
  deleteConfigEntityById,
  importFirstConfigEntityFromFile,
} from './IdmOps';
import { deleteJourney, importJourneyFromFile } from './JourneyOps';
import { deleteMapping, importMappingFromFile } from './MappingOps';
import {
  deleteOauth2ClientById,
  importOAuth2ClientFromFile,
} from './OAuth2ClientOps';
import { deletePolicyById, importPolicyFromFile } from './PolicyOps';
import {
  deleteResourceTypeUsingName,
  importResourceTypesFromFile,
} from './ResourceTypeOps';
import { deleteScriptId, importScriptsFromFile } from './ScriptOps';
import { deleteService, importFirstServiceFromFile } from './ServiceOps.js';

const { findOrphanedNodes, removeOrphanedNodes } = frodo.authn.node;

const { applyUpdates } = frodo.cloud.startup;

const {
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
  getRealmUsingExportFormat,
} = frodo.utils;
const { exportFullConfiguration } = frodo.config;

const exportDir = getWorkingDirectory(true) + '/frodo-export';

const changed = new Array<string>();
const deleted = new Array<string>();
const added = new Array<string>();
const realms = new Set<string>();
const logmessages = new Array<string>();

let PromptPrune = false;
let NoPrune = false;

interface CompareObj {
  added: Array<string>;
  changed: Array<string>;
  deleted: Array<string>;
}

export async function compareExportToDirectory(
  masterDir: string,
  exportDir: string,
  whatIf: boolean,
  effectSecrets: boolean = false,
  wait: boolean = false,
  promptPrune: boolean = false,
  noPrune: boolean = false,
  printDiff: boolean = false,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
    coords: true,
    includeDefault: true,
    includeActiveValues: false,
    target: '',
  }
): Promise<boolean> {
  try {
    PromptPrune = promptPrune;
    NoPrune = noPrune;
    verboseMessage(
      `We are not currently using these options: ${options} but plan to at a future date`
    );
    verboseMessage(`Master dir: ${masterDir}`);
    verboseMessage(`Export dir: ${exportDir}`);

    verboseMessage('fileDiffing');
    const fileDiffname = 'fileDiff.config.json';
    compareDirectories(exportDir, masterDir);

    const compareObj: CompareObj = {
      added: added,
      changed: changed,
      deleted: deleted,
    };
    if (printDiff) {
      saveJsonToFile(compareObj, getFilePath('a1' + fileDiffname, true));
    }

    verboseMessage(realms);

    for (const realm of realms) {
      let realmAdded = new Array<string>();
      let realmChanged = new Array<string>();
      let realmDeleted = new Array<string>();

      if (realm === 'global') {
        realmAdded = added.filter((val) =>
          val.substring(0, val.indexOf('/')).includes('global')
        );
        realmChanged = changed.filter((val) =>
          val.substring(0, val.indexOf('/')).includes('global')
        );
        realmDeleted = deleted.filter((val) =>
          val.substring(0, val.indexOf('/')).includes('global')
        );
      } else {
        realmAdded = added.filter(
          (val) =>
            val.substring(
              val.indexOf('/') + 1,
              val.indexOf('/', val.indexOf('/') + 1)
            ) === realm
        );
        realmChanged = changed.filter(
          (val) =>
            val.substring(
              val.indexOf('/') + 1,
              val.indexOf('/', val.indexOf('/') + 1)
            ) == realm
        );
        realmDeleted = deleted.filter(
          (val) =>
            val.substring(
              val.indexOf('/') + 1,
              val.indexOf('/', val.indexOf('/') + 1)
            ) === realm
        );
      }

      verboseMessage(realm);
      const compObj: CompareObj = {
        added: realmAdded,
        changed: realmChanged,
        deleted: realmDeleted,
      };
      verboseMessage(compObj);
      if (!whatIf) {
        await effectDifferences(compObj, masterDir, exportDir, effectSecrets);
      }
    }

    if (!whatIf) {
      const globalSync = changed.find((val) => val === 'global/idm/sync.json');
      if (globalSync) {
        await changeFile('global/idm/sync.json', masterDir);
      }
      if (enviornmentChanged(compareObj) && effectSecrets) {
        await applyUpdates(wait);
        verboseMessage(
          'Must wait around 10 minutes because the enviornment is updating'
        );
      }
    }

    if (printDiff) {
      saveJsonToFile(logmessages, getFilePath('a2' + fileDiffname, true));
    }

    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

function enviornmentChanged(files: CompareObj): boolean {
  // variables
  let variable = files.changed.find((val) => val.includes('global/variable'));
  if (variable) {
    return true;
  }
  variable = files.added.find((val) => val.includes('global/variable'));
  if (variable) {
    return true;
  }
  variable = files.deleted.find((val) => val.includes('global/variable'));
  if (variable) {
    return true;
  }
  // secrets
  // variable = files.changed.find((val) => val.includes('global/secret'));
  // if (variable) {
  //   return true;
  // }
  // variable = files.added.find((val) => val.includes('global/secret'));
  // if (variable) {
  //   return true;
  // }
  // variable = files.deleted.find((val) => val.includes('global/secret'));
  // if (variable) {
  //   return true;
  // }
}

export async function effectDifferences(
  compObj: CompareObj,
  masterDir: string,
  exportDir: string,
  effectSecrets: boolean = false
) {
  for (const add of compObj.added) {
    await addFile(add, masterDir, effectSecrets);
  }
  for (const change of compObj.changed) {
    await changeFile(change, masterDir, effectSecrets);
  }
  for (const del of compObj.deleted) {
    await deleteFile(del, exportDir, effectSecrets);
  }
  verboseMessage(`finished effect differences`);
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
  includeMeta: boolean = false
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
        checkChange(relativePath, dir2, `${dir1}/${relativePath}`);
      }
    } else {
      checkForRealmFromPath(relativePath);
      if (checkTypeIsPromotable(relativePath)) {
        deleted.push(`${relativePath}`);
      }
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
      checkForRealmFromPath(relativePath);
      if (checkTypeIsPromotable(relativePath)) {
        added.push(`${relativePath}`);
      }
    }
  });
}

function removeKeysAndCompare(
  importFilePath: string,
  counterpartPath: string,
  keysToRemove: Array<string>
): boolean {
  const data = fs.readFileSync(importFilePath, 'utf8');
  const obj = removeKeys(JSON.parse(data), keysToRemove);
  const dataCopy = fs.readFileSync(counterpartPath, 'utf8');
  const objCopy = removeKeys(JSON.parse(dataCopy), keysToRemove);
  if (JSON.stringify(objCopy) === JSON.stringify(obj)) {
    return true;
  }
  return false;
}

function removeKeys(obj, keysToRemove) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([key]) => !keysToRemove.includes(key)) // Exclude specified keys
      .map(([key, value]) =>
        value && typeof value === 'object'
          ? [key, removeKeys(value, keysToRemove)]
          : [key, value]
      )
  );
}

function removeNullsAndCompare(
  importFilePath: string,
  counterpartPath: string
): boolean {
  const data = fs.readFileSync(importFilePath, 'utf8');
  const object = removeNulls(JSON.parse(data));
  const dataCopy = fs.readFileSync(counterpartPath, 'utf8');
  const objectCopy = removeNulls(JSON.parse(dataCopy));
  if (JSON.stringify(object) === JSON.stringify(objectCopy)) {
    return true;
  }
  return false;
}

function removeNulls(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== null)
      .map(([key, value]) =>
        value && typeof value === 'object'
          ? [key, removeNulls(value)]
          : [key, value]
      )
  );
}

function checkChange(path: string, dir: string, counterpartPath: string) {
  const type = getTypeFromPath(path);
  const importFilePath = dir + '/' + path;
  switch (type) {
    case 'policy': {
      const keysToRemove = [
        'createdBy',
        'creationDate',
        'lastModifiedDate',
        'lastModifiedBy',
      ];
      if (removeKeysAndCompare(importFilePath, counterpartPath, keysToRemove)) {
        return;
      }
      break;
    }
    case 'resourcetype': {
      const keysToRemove = [
        'createdBy',
        'creationDate',
        'lastModifiedDate',
        'lastModifiedBy',
      ];
      if (removeKeysAndCompare(importFilePath, counterpartPath, keysToRemove)) {
        return;
      }
      break;
    }
    case 'sync': {
      if (importFilePath.includes('/sync.json')) {
        const keysToRemove = ['meta'];
        if (
          removeKeysAndCompare(importFilePath, counterpartPath, keysToRemove)
        ) {
          return;
        }
      }
      break;
    }
    case 'application': {
      if (removeNullsAndCompare(importFilePath, counterpartPath)) {
        return;
      }
      break;
    }
    case 'variable': {
      const keysToRemove = ['lastChangeDate', 'lastChangedBy'];
      if (removeKeysAndCompare(importFilePath, counterpartPath, keysToRemove)) {
        return;
      }
      break;
    }
    default:
      break;
  }
  if (checkTypeIsPromotable(path)) {
    checkForRealmFromPath(path);
    changed.push(`${path}`);
  }
}

async function changeFile(
  path: string,
  dir: string,
  effectSecrets: boolean = false
) {
  logmessages.push('file changed:');
  verboseMessage('File Changed: ');
  await addFile(path, dir, effectSecrets);
}

async function addFile(
  path: string,
  dir: string,
  effectSecrets: boolean = false
) {
  const type = getTypeFromPath(path);
  const importFilePath = dir + '/' + path;
  const global = path.substring(0, path.indexOf('/')) === 'global';
  const inRealm = path.substring(0, path.indexOf('/')) === 'realm';
  setRealmFromPath(path, inRealm);

  await addSwitch(importFilePath, type, global, inRealm, effectSecrets);
}

async function addSwitch(
  importFilePath: string,
  type: string,
  global: boolean,
  inRealm: boolean,
  effectSecrets: boolean = false
) {
  switch (type) {
    case 'application': {
      const application = getJsonObjectTwoDown(importFilePath);
      verboseMessage(`application id: ${application._id}`);
      const outcome = await importOAuth2ClientFromFile(
        application._id,
        importFilePath,
        {
          deps: true,
        }
      );
      logmessages.push(`add application ${importFilePath}`);
      verboseMessage(`add application ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'authentication': {
      const outcome =
        await importAuthenticationSettingsFromFile(importFilePath);
      logmessages.push(`add authentication ${importFilePath}`);
      verboseMessage(`add authentication ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'journey': {
      const journey = getJsonObjectOneDown(importFilePath);
      const journeyId = Object.keys(journey)[0];
      verboseMessage(`journey Id: ${journeyId}`);
      const outcome = await importJourneyFromFile(journeyId, importFilePath, {
        reUuid: false,
        deps: true,
      });
      logmessages.push(`add journey ${importFilePath}`);
      verboseMessage(`add journey ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'managedApplication': {
      const outcome = await importApplicationsFromFile(importFilePath, {
        deps: true,
      });
      logmessages.push(`add managedApplication ${importFilePath}`);
      verboseMessage(`add managedApplication ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'resourcetype': {
      const outcome = await importResourceTypesFromFile(importFilePath);
      logmessages.push(`add resourcetype ${importFilePath}`);
      verboseMessage(`add resourcetype ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'script': {
      if (
        importFilePath.endsWith('.js') ||
        importFilePath.endsWith('.groovy')
      ) {
        verboseMessage(importFilePath);
        verboseMessage(
          'this is a script file, we will not import it as a script file,' +
            'but will import the config and that should import the script as well\n'
        );
        logmessages.push(importFilePath);
        logmessages.push(
          'this is a script file, we will not import it as a script file,' +
            'but will import the config and that should import the script as well\n'
        );
        logmessages.push(' ');
        break;
      }
      const script = getJsonObjectTwoDown(importFilePath);
      verboseMessage(`script name: ${script.name}`);
      verboseMessage(`script id: ${script._id}`);
      const outcome = await importScriptsFromFile(
        script._id,
        script.name,
        importFilePath,
        {
          deps: true,
          reUuid: false,
          includeDefault: false,
        }
      );
      logmessages.push(`add script ${importFilePath}`);
      verboseMessage(`add script ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'service': {
      logmessages.push(`add service ${importFilePath}`);
      verboseMessage(`add service ${importFilePath}\n`);
      if (global) {
        const outcome = await importFirstServiceFromFile(importFilePath, {
          clean: false,
          global: global,
          realm: inRealm,
        });
        logmessages.push(`outcome: ${outcome}`);
      } else {
        const outcome = await importFirstServiceFromFile(importFilePath, {
          clean: true,
          global: global,
          realm: inRealm,
        });
        logmessages.push(`outcome: ${outcome}`);
      }

      logmessages.push(' ');
      break;
    }
    case 'theme': {
      // Taken care of by Idm

      // const theme = getJsonObjectTwoDown(importFilePath)
      // logmessages.push(`Theme Id: ${theme._id}`)
      // const outcome = await importThemesFromFile(importFilePath)
      // logmessages.push(`add theme ${importFilePath}`);
      // verboseMessage(`add theme ${importFilePath}\n`);
      // logmessages.push(`outcome: ${outcome}`)
      // logmessages.push(' ');
      break;
    }
    case 'emailTemplate': {
      const emailTemplate = getJsonObjectTwoDown(importFilePath);
      verboseMessage(`Email Template Id: ${emailTemplate._id}`);
      const outcome = await importEmailTemplateFromFile(
        emailTemplate._id,
        importFilePath,
        false
      );
      logmessages.push(`add emailTemplate ${importFilePath}`);
      verboseMessage(`add emailTemplate ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'idm': {
      if (importFilePath.includes('emailTemplate')) {
        break;
      }
      const outcome = await importFirstConfigEntityFromFile(importFilePath);
      logmessages.push(`add idm ${importFilePath}`);
      verboseMessage(`add idm ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'secret': {
      if (effectSecrets) {
        const secret = getJsonObjectTwoDown(importFilePath);

        verboseMessage(`Importing secret ${secret._id}...`);
        // const outcome = await importSecretFromFile(
        //   nestedSecret._id,
        //   importFilePath,
        //   false,
        //   null
        // );
        logmessages.push(`add secret ${importFilePath}`);
        verboseMessage(`add secret ${importFilePath}\n`);
        // logmessages.push(`outcome: ${outcome}`)
        logmessages.push(' ');
      }
      break;
    }
    case 'sync': {
      const data = fs.readFileSync(importFilePath, 'utf8');
      const importData = JSON.parse(data);
      verboseMessage(`sync Id: ${importData._id}`);
      const outcome = await importMappingFromFile(
        importData._id,
        importFilePath,
        {
          deps: true,
        }
      );
      logmessages.push(`add sync ${importFilePath}`);
      verboseMessage(`add sync ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'variable': {
      if (effectSecrets) {
        const variable = getJsonObjectOneDown(importFilePath);
        verboseMessage(`Importing variable ${variable._id}...`);
        const outcome = await importVariableFromFile(
          variable._id,
          importFilePath
        );
        logmessages.push(`add variable ${importFilePath}`);
        verboseMessage(`add variable ${importFilePath}\n`);
        logmessages.push(`outcome: ${outcome}`);
        logmessages.push(' ');
      }
      break;
    }
    case 'mapping': {
      const data = fs.readFileSync(importFilePath, 'utf8');
      const importData = JSON.parse(data);
      verboseMessage(`mapping Id: ${importData._id}`);
      const outcome = await importMappingFromFile(
        importData._id,
        importFilePath,
        {
          deps: true,
        }
      );
      logmessages.push(`add mapping ${importFilePath}`);
      verboseMessage(`add mapping ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'agent': {
      const agent = getJsonObjectTwoDown(importFilePath);
      const agentType = agent._type._id;
      verboseMessage(`Agent id: ${agent._id} and type: ${agentType}`);
      switch (agentType) {
        case 'WebAgent': {
          const outcome = await importWebAgentFromFile(
            agent._id,
            importFilePath
          );
          logmessages.push(`add agents ${importFilePath}`);
          verboseMessage(`add agents ${importFilePath}\n`);
          logmessages.push(`outcome: ${outcome}`);
          break;
        }
        case 'IdentityGatewayAgent': {
          const outcome = await importIdentityGatewayAgentFromFile(
            agent._id,
            importFilePath
          );
          logmessages.push(`add agents ${importFilePath}`);
          verboseMessage(`add agents ${importFilePath}\n`);
          logmessages.push(`outcome: ${outcome}`);
          break;
        }
        case 'J2EEAgent': {
          const outcome = await importJavaAgentFromFile(
            agent._id,
            importFilePath
          );
          logmessages.push(`add agents ${importFilePath}`);
          verboseMessage(`add agents ${importFilePath}\n`);
          logmessages.push(`outcome: ${outcome}`);
          break;
        }
        default: {
          const outcome = importAgentFromFile(agent._id, importFilePath);
          logmessages.push(`add agents ${importFilePath}`);
          verboseMessage(`add agents ${importFilePath}\n`);
          logmessages.push(`outcome: ${outcome}`);
          break;
        }
      }
      logmessages.push(' ');
      break;
    }
    case 'idp': {
      //taken care of by service

      // const idp = getJsonObjectTwoDown(importFilePath)
      // logmessages.push(`add idp ${importFilePath}`);
      // verboseMessage(`add idp with id: ${idp._id} from file: ${importFilePath}`);
      // const outcome = await importSocialIdentityProviderFromFile(
      //   idp._id,
      //   importFilePath,
      //   {
      //     deps: false
      //   }
      // )
      // logmessages.push(`outcome = ${outcome}`);
      // logmessages.push(' ');
      break;
    }
    case 'policy': {
      const policy = getJsonObjectTwoDown(importFilePath);
      verboseMessage(`Add Policy with id: ${policy._id}`);
      const outcome = await importPolicyFromFile(policy._id, importFilePath, {
        deps: true,
        prereqs: false,
      });
      logmessages.push(`add policy ${importFilePath}`);
      verboseMessage(`add policy ${importFilePath}\n`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'policyset': {
      break;
    }
    case 'saml': {
      // const hosted = getJsonObjectOneDown(importFilePath).hosted
      // const saml = hosted[Object.keys(hosted)[0]];
      // verboseMessage(`add saml with entityID = ${saml.entityId}`)
      // logmessages.push(`add saml with entityID = ${saml.entityId}`);
      // const outcome = await importSaml2ProviderFromFile(
      //   saml.entityId,
      //   importFilePath,
      //   { deps: true }
      // )
      // logmessages.push(`add saml ${importFilePath}`);
      // verboseMessage(`add saml ${importFilePath}\n`);
      // logmessages.push(`outcome: ${outcome}`)
      // logmessages.push(' ');
      break;
    }
    case 'cot': {
      // verboseMessage(`Add Circle of Trusts from file: ${importFilePath}`)
      // const outcome = await importCirclesOfTrustFromFile(importFilePath);
      // logmessages.push(`Add Circle of Trusts from file: ${importFilePath}`)
      break;
    }
    default: {
      logmessages.push(`missed add for ${importFilePath} with type ${type}`);
      verboseMessage(`missed add for ${importFilePath} with type ${type}\n`);
      logmessages.push(' ');
      break;
    }
  }
  return;
}

async function deleteFile(
  path: string,
  dir: string,
  effectSecrets: boolean = false
) {
  const type = getTypeFromPath(path);
  const deleteFilePath = dir + '/' + path;
  const global = path.substring(0, path.indexOf('/')) === 'global';
  const inRealm = path.substring(0, path.indexOf('/')) === 'realm';
  setRealmFromPath(path, inRealm);

  await deleteSwitch(deleteFilePath, type, global, effectSecrets);
}

async function deleteSwitch(
  deleteFilePath: string,
  type: string,
  global: boolean,
  effectSecrets: boolean = false
) {
  switch (type) {
    case 'application': {
      const application = getJsonObjectTwoDown(deleteFilePath);
      logmessages.push(`delete application with id ${application._id}`);
      verboseMessage(`delete application with id ${application._id}`);
      const outcome = await deleteOauth2ClientById(application._id);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      break;
    }
    case 'authentication': {
      logmessages.push(`no delete exitsts for authentication`);
      logmessages.push(`delete authentication ${deleteFilePath}`);
      logmessages.push(' ');
      verboseMessage(`no delete exitsts for authentication`);
      verboseMessage(`delete authentication ${deleteFilePath}\n`);
      break;
    }
    case 'journey': {
      const journey = getJsonObjectOneDown(deleteFilePath);
      const journeyId = Object.keys(journey)[0];
      verboseMessage(
        `Deleting journey ${journeyId} in realm "${state.getRealm()}"...`
      );
      const outcome = await deleteJourney(journeyId, {
        deep: true,
        verbose: false,
        progress: false,
      });
      logmessages.push(`delete journey ${deleteFilePath}`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      verboseMessage(`delete journey ${deleteFilePath}\n`);
      if (!NoPrune) {
        verboseMessage(
          `Pruning orphaned configuration artifacts in realm "${state.getRealm()}"...`
        );
        try {
          const orphanedNodes = await findOrphanedNodes();
          if (orphanedNodes.length > 0) {
            if (PromptPrune) {
              const ok = await yesno({
                question: `Prune (permanently delete) orphaned nodes from journey ${journeyId}? (y|n):`,
              });
              if (ok) {
                await removeOrphanedNodes(orphanedNodes);
              }
            } else {
              await removeOrphanedNodes(orphanedNodes);
            }
          } else {
            verboseMessage('No orphaned nodes found.');
          }
        } catch (error) {
          printError(error);
          process.exitCode = 1;
        }
      }
      break;
    }
    case 'managedApplication': {
      const managedApplication = getJsonObjectTwoDown(deleteFilePath);
      verboseMessage(
        `Deleting Managed Application with name ${managedApplication.name}`
      );
      const outcome = await deleteApplication(managedApplication.name, true);
      logmessages.push(`delete managedApplication ${deleteFilePath}`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      verboseMessage(`delete managedApplication ${deleteFilePath}\n`);
      break;
    }
    case 'resourcetype': {
      const resourcetype = getJsonObjectTwoDown(deleteFilePath);
      verboseMessage(
        `Deleting authorization resource type ${resourcetype.name}`
      );
      const outcome = await deleteResourceTypeUsingName(resourcetype.name);
      logmessages.push(`delete resourcetype ${deleteFilePath}`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      verboseMessage(`delete resourcetype ${deleteFilePath}\n`);
      break;
    }
    case 'script': {
      if (
        deleteFilePath.endsWith('.js') ||
        deleteFilePath.endsWith('.groovy')
      ) {
        verboseMessage(deleteFilePath);
        verboseMessage(
          'this is a script file, we will not delete it as a script file,' +
            'but will delete the config and that should delete the script as well\n'
        );
        logmessages.push(deleteFilePath);
        logmessages.push(
          'this is a script file, we will not delete it as a script file,' +
            'but will delete the config and that should delete the script as well\n'
        );
        logmessages.push(' ');
        break;
      }
      const script = getJsonObjectTwoDown(deleteFilePath);
      verboseMessage(
        `Deleting script ${script._id} in realm "${state.getRealm()}"...`
      );
      const outcome = await deleteScriptId(script._id);
      logmessages.push(`delete script ${deleteFilePath}`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      verboseMessage(`delete script ${deleteFilePath}\n`);
      break;
    }
    case 'service': {
      const service = getJsonObjectOneDown(deleteFilePath);
      const serviceId = Object.keys(service)[0];
      verboseMessage(`service Id: ${serviceId}`);
      const outcome = await deleteService(serviceId, global);
      logmessages.push(`delete service ${deleteFilePath}`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      verboseMessage(`delete service ${deleteFilePath}\n`);
      break;
    }
    case 'theme': {
      //taken care of by Idm

      // const theme = getJsonObjectTwoDown(deleteFilePath);
      // verboseMessage(
      //   `Deleting theme with id "${
      //     theme._id
      //   }" from realm "${state.getRealm()}"...`
      // );
      // const outcome = await deleteTheme(theme._id);
      // logmessages.push(`delete theme ${deleteFilePath}`);
      // logmessages.push(`outcome: ${outcome}`);
      // logmessages.push(' ');
      // verboseMessage(`delete theme ${deleteFilePath}\n`);
      break;
    }
    case 'emailTemplate': {
      // Taken care of by the Idm config
      break;
    }
    case 'idm': {
      const data = fs.readFileSync(deleteFilePath, 'utf8');
      const fileData = JSON.parse(data);
      const entityId = fileData._id;
      verboseMessage(`delete Idm config with entity Id: ${entityId}`);
      logmessages.push(`delete Idm config with entity Id: ${entityId}`);
      const outcome = await deleteConfigEntityById(entityId);
      logmessages.push(`No delete written for idm`);
      logmessages.push(`delete idm ${deleteFilePath}`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      verboseMessage(`delete idm ${deleteFilePath}\n`);
      break;
    }
    case 'secret': {
      if (effectSecrets) {
        const secret = getJsonObjectTwoDown(deleteFilePath);
        verboseMessage(`Deleting secret with id ${secret._id}`);
        // const outcome = await deleteSecret(secret._id);
        logmessages.push(`delete secret ${deleteFilePath}`);
        // logmessages.push(`outcome: ${outcome}`)
        logmessages.push(' ');
        verboseMessage(`delete secret ${deleteFilePath}\n`);
      }
      break;
    }
    case 'sync': {
      const data = fs.readFileSync(deleteFilePath, 'utf8');
      const sync = JSON.parse(data);
      verboseMessage(`sync Id: ${sync._id}`);
      const outcome = await deleteMapping(sync._id);
      logmessages.push(`delete sync ${deleteFilePath}`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      verboseMessage(`delete sync ${deleteFilePath}\n`);
      break;
    }
    case 'variable': {
      if (effectSecrets) {
        const variable = getJsonObjectTwoDown(deleteFilePath);
        verboseMessage(`Deleting variable with id: ${variable._id}`);
        const outcome = await deleteVariableById(variable._id);
        logmessages.push(`delete variable ${deleteFilePath}`);
        logmessages.push(`outcome: ${outcome}`);
        logmessages.push(' ');
        verboseMessage(`delete variable ${deleteFilePath}\n`);
      }
      break;
    }
    case 'mapping': {
      const data = fs.readFileSync(deleteFilePath, 'utf8');
      const mapping = JSON.parse(data);
      verboseMessage(`mapping Id: ${mapping._id}`);
      const outcome = await deleteMapping(mapping._id);
      logmessages.push(`delete mapping ${deleteFilePath}`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      verboseMessage(`delete mapping ${deleteFilePath}\n`);
      break;
    }
    case 'agent': {
      const agent = getJsonObjectTwoDown(deleteFilePath);
      const agentType = agent._type._id;
      verboseMessage(
        `Deleting agent '${agent._id}' of type ${agentType} in realm "${state.getRealm()}"...`
      );
      switch (agentType) {
        case 'WebAgent': {
          const outcome = await deleteWebAgent(agent._id);
          logmessages.push(`delete WebAgent ${deleteFilePath}`);
          logmessages.push(`outcome: ${outcome}`);
          verboseMessage(`delete agents ${deleteFilePath}\n`);
          break;
        }
        case 'IdentityGatewayAgent': {
          const outcome = await deleteIdentityGatewayAgent(agent._id);
          logmessages.push(`delete IdentityGatewayAgent ${deleteFilePath}`);
          logmessages.push(`outcome: ${outcome}`);
          verboseMessage(`delete agents ${deleteFilePath}\n`);
          break;
        }
        case 'J2EEAgent': {
          const outcome = await deleteJavaAgent(agent._id);
          logmessages.push(`delete IdentityGatewayAgent ${deleteFilePath}`);
          logmessages.push(`outcome: ${outcome}`);
          verboseMessage(`delete agents ${deleteFilePath}\n`);
          break;
        }
        default: {
          const outcome = await deleteAgent(agent._id);
          logmessages.push(`delete agents ${deleteFilePath}`);
          logmessages.push(`outcome: ${outcome}`);
          verboseMessage(`delete agents ${deleteFilePath}\n`);
          break;
        }
      }
      logmessages.push(' ');
      break;
    }
    case 'idp': {
      // taken care of by service

      // const idp = getJsonObjectTwoDown(deleteFilePath)
      // verboseMessage(`delete idp with id: ${idp._id} from file: ${deleteFilePath}`)
      // logmessages.push(`delete idp with id: ${idp._id} from file: ${deleteFilePath}`);
      // const outcome = await deleteSocialIdentityProviderById(idp._id)
      // logmessages.push(`outcome: ${outcome}`)
      // logmessages.push(' ');
      // verboseMessage(`delete idp ${deleteFilePath}\n`);
      break;
    }
    case 'policy': {
      const policy = getJsonObjectTwoDown(deleteFilePath);
      verboseMessage(`policy id: ${policy._id}`);
      const outcome = await deletePolicyById(policy._id);
      logmessages.push(`delete policy ${deleteFilePath}`);
      logmessages.push(`outcome: ${outcome}`);
      logmessages.push(' ');
      verboseMessage(`delete policy ${deleteFilePath}\n`);
      break;
    }
    case 'cot': {
      // logmessages.push(`no delete exitsts for Circle of Trust`);
      // logmessages.push(`delete Circle of Trust ${deleteFilePath}`);
      // logmessages.push(' ');
      // verboseMessage(`no delete exitsts for Circle of Trust`);
      // verboseMessage(`delete Circle of Trust ${deleteFilePath}\n`);
      break;
    }
    case 'policyset': {
      // const policyset = getJsonObjectOneDown(deleteFilePath);
      // verboseMessage(`policy set Id: ${Object.keys(policyset)[0]}`);
      // const outcome = await deletePolicySetById(Object.keys(policyset)[0]);
      // logmessages.push(`delete policyset ${deleteFilePath}`);
      // logmessages.push(`outcome: ${outcome}`)
      // logmessages.push(' ');
      // verboseMessage(`delete policyset ${deleteFilePath}\n`);
      break;
    }
    case 'saml': {
      // const hosted = getJsonObjectOneDown(deleteFilePath).hosted
      // const saml = hosted[Object.keys(hosted)[0]];
      // verboseMessage(`delete saml with entityID = ${saml.entityId}`)
      // logmessages.push(`delete saml with entityID = ${saml.entityId}`);
      // await deleteSaml2ProviderById(saml.entityId)
      // logmessages.push(`delete saml ${deleteFilePath}`);
      // logmessages.push(' ');
      // verboseMessage(`delete saml ${deleteFilePath}\n`);
      break;
    }
    default: {
      logmessages.push(
        `No delete ${deleteFilePath} not setup for type ${type}`
      );
      logmessages.push(' ');
      verboseMessage(
        `No delete ${deleteFilePath} not setup for type ${type}\n`
      );
      break;
    }
  }
  return;
}

function getJsonObjectTwoDown(filePath: string): any {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    const jsonObject = fileData[Object.keys(fileData)[0]];
    return jsonObject[Object.keys(jsonObject)[0]];
  } catch {
    new FrodoError('error in json parsing');
  }
}

function getJsonObjectOneDown(filePath: string): any {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    return fileData[Object.keys(fileData)[0]];
  } catch {
    new FrodoError('error in json parsing');
  }
}

function setRealmFromPath(path: string, inRealm: boolean) {
  if (inRealm) {
    let realm = path.substring(
      path.indexOf('/') + 1,
      path.indexOf('/', path.indexOf('/') + 1)
    );
    realm = getRealmUsingExportFormat(realm);
    verboseMessage(`realm = ${realm}`);
    state.setRealm(realm);
  }
}

function checkForRealmFromPath(path: string) {
  const inRealm = path.substring(0, path.indexOf('/')) === 'realm';
  if (inRealm) {
    const realm = path.substring(
      path.indexOf('/') + 1,
      path.indexOf('/', path.indexOf('/') + 1)
    );
    realms.add(realm);
  } else {
    realms.add('global');
  }
}

function checkTypeIsPromotable(path: string): boolean {
  const type = getTypeFromPath(path);
  let promotable = true;

  switch (type) {
    case 'cot': {
      promotable = false;
      break;
    }
    case 'policyset': {
      promotable = false;
      break;
    }
    case 'saml': {
      promotable = false;
      break;
    }
    default:
      promotable = true;
  }
  return promotable;
}

function getTypeFromPath(path: string): string {
  let type: string;
  if (path.includes('idm')) {
    type = 'idm';
  } else {
    type = path.substring(
      path.substring(0, path.lastIndexOf('/')).lastIndexOf('/') + 1,
      path.lastIndexOf('/')
    );
  }
  return type;
}
