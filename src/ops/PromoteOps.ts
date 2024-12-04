import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
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

const { saveJsonToFile, getFilePath, getRealmUsingExportFormat } = frodo.utils;

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

/**
 * runs a comparison of two config export directories (AxND flags) to check for differences and
 * if there are differences it will then run imports and deletes on the tenant based off those differences found
 * @param masterDir master directory that the changes run will try to emulate
 * @param exportDir exported directory that the master dir is compared to
 * @param whatIf flag to run the comparison but not affect the differences if true
 * @param effectSecrets if true esv's will be effected
 * @param wait causes function to wait for an environment refresh to finish before letting to of control if a refresh is necessary
 * @param promptPrune when true if a prune of orphaned nodes will run the user will be prompted to say yes or no
 * @param noPrune when true pruning of orphaned nodes will not occur
 * @param printDiff when true outputs two files, one that shows the files that were changed in some way and another that
 * gives a log for if the changes were successful or not
 */
export async function compareExportToDirectory(
  masterDir: string,
  exportDir: string,
  whatIf: boolean,
  effectSecrets: boolean = false,
  wait: boolean = false,
  promptPrune: boolean = false,
  noPrune: boolean = false,
  printDiff: boolean = false
): Promise<boolean> {
  try {
    PromptPrune = promptPrune;
    NoPrune = noPrune;
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

/**
 * checks to see if there were any changes to esv's to see if an environment refresh is necessary
 * @param files the compare object we need to filter through to see if any variables or secrets were changed
 */
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
  // todo: need to work around how secrets encrpt
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

/**
 * Takes in a compare object and runs through all the imports and exports that were determined by and earlier
 * copmarison
 * @param compObj object that contains the sub-paths for all the configs that were changed, added, or deleted
 * @param masterDir path to the master directory
 * @param exportDir path to the export directory
 * @param effectSecrets true if we want esv's to be effected
 */
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
 * hashes the file with sha256
 * @param filePath path to the config object
 */
function hashFile(filePath): string {
  const hash = crypto.createHash('sha256');
  const fileData = fs.readFileSync(filePath);
  hash.update(fileData);
  return hash.digest('hex');
}

/**
 * Compares all the files within two separate directories that have identical file structures
 * @param dir1 path to the master directory
 * @param dir2 path to the export directory
 */
function compareDirectories(dir1: string, dir2: string) {
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

/**
 * removes specific keys from two json objects and then compares them to determine a difference
 * @param masterFilePath path to the master config object
 * @param counterpartPath path to the exported config object
 * @param keysToRemove keys to remove from the objects before comparing them
 */
function removeKeysAndCompare(
  masterFilePath: string,
  counterpartPath: string,
  keysToRemove: Array<string>
): boolean {
  const data = fs.readFileSync(masterFilePath, 'utf8');
  const obj = removeKeys(JSON.parse(data), keysToRemove);
  const dataCopy = fs.readFileSync(counterpartPath, 'utf8');
  const objCopy = removeKeys(JSON.parse(dataCopy), keysToRemove);
  return JSON.stringify(objCopy) === JSON.stringify(obj);
}

/**
 * removes specific keys and values from json objects
 * @param obj the object that we want to remove the values from
 * @param keysToRemove the keys to remove from that object
 */
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

/**
 * removes nulls from json objects and then compares the two objects for changes
 * @param masterFilePath path to the master config object
 * @param counterpartPath path to the export config object
 */
function removeNullsAndCompare(
  masterFilePath: string,
  counterpartPath: string
): boolean {
  const data = fs.readFileSync(masterFilePath, 'utf8');
  const object = removeNulls(JSON.parse(data));
  const dataCopy = fs.readFileSync(counterpartPath, 'utf8');
  const objectCopy = removeNulls(JSON.parse(dataCopy));
  return JSON.stringify(object) === JSON.stringify(objectCopy);
}

/**
 * removes nulls from the config objects
 * @param obj object to remove the null values from
 */
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

/**
 * When these objects change certain parts are not as important as others when they are changed
 * so if that part is determined to have been the part that changed and other parts did not change
 * the object will not be flagged as changed.
 * @param path sub-path to the config object
 * @param dir path to the master directory
 * @param counterpartPath path to the export directory
 */
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

/**
 * logs messages to say the file was changed then calls add file
 * @param path sub-path to the config object
 * @param dir path to the base directory where the sub-path starts
 * @param effectSecrets true if we want to change esv's
 */
async function changeFile(
  path: string,
  dir: string,
  effectSecrets: boolean = false
) {
  logmessages.push('file changed:');
  verboseMessage('File Changed: ');
  await addFile(path, dir, effectSecrets);
}

/**
 * Sets the variables before running the add switch statement
 * @param path sub-path to the config object
 * @param dir path to the base directory where the sub-path starts
 * @param effectSecrets true if we want to change esv's
 */
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

/**
 * A switch statement for effecting imports to the different config files if it was determined that a file
 * was changed or needs to be added into the tenant
 * @param importFilePath path to the config object
 * @param type object type of the config object
 * @param global tru if the config is in the global realm
 * @param inRealm true if the object is in any realm other than the global realm
 * @param effectSecrets set to true if we want esv's to be changed
 */
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
    // Taken care of by Idm
    case 'theme': {
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
    // todo: need to determine how to get the compare to work properly
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
    // Taken care of by service
    case 'idp': {
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
    // These next three object types have deletes written for them, but they are not promotable so we don't worry about effecting them
    case 'policyset': {
      break;
    }
    case 'saml': {
      break;
    }
    case 'cot': {
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

/**
 * sets the variables necessary from the path and then runs the delete switch
 * @param path path to the config object
 * @param dir the base directory that leads to the config object
 * @param effectSecrets true if we want to effect changes to esv's
 */
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

/**
 * A switch statement for effecting deletes to different config files
 * @param deleteFilePath the path to the delete config object
 * @param type the type of object to delete
 * @param global true if the object is in the global config
 * @param effectSecrets set to true if we want esv's to be changed
 */
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
    // Taken care of by Idm
    case 'theme': {
      break;
    }
    // Taken care of by the Idm config
    case 'emailTemplate': {
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
    // todo: Currently secrets when exported are hashed so it needs to be thought of more
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
    // When an idp object is modified so is a service file, by changing the service config it will also
    // change the idp config.
    case 'idp': {
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
    // These next three object types have deletes written for them, but they are not promotable so we don't worry about effecting them
    case 'cot': {
      break;
    }
    case 'policyset': {
      break;
    }
    case 'saml': {
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

/**
 * Opens the file and returns the json object two keys down into the config object.
 * @param filePath
 */
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

/**
 * Opens the file and returns a json object one element down from the top object
 * @param filePath path to the config file
 */
function getJsonObjectOneDown(filePath: string): any {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    return fileData[Object.keys(fileData)[0]];
  } catch {
    new FrodoError('error in json parsing');
  }
}

/**
 * Sets the realm for the next command to run on.
 * @param path sub-path to the config file currently being looked at
 * @param inRealm if the object is in a realm or not
 */
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

/**
 * Pulls the path out of the path to the config file we are referencing.
 * @param path the sub-path to the config file
 */
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

/**
 * These three object types are not promotable so we don't care to import or delete them with changes.
 * @param path path to the config file we are looking at
 */
function checkTypeIsPromotable(path: string): boolean {
  const type = getTypeFromPath(path);
  let promotable: boolean;
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

/**
 * Pass in the path for where the export is and using a substring of that path
 * the type is inferred from the directory where the file was stored.
 * @param path the sub-path that is used to determine the type
 */
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
