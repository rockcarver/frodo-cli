import { frodo, state } from '@rockcarver/frodo-lib';
import { ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ScriptApi';

import { printError, verboseMessage } from '../utils/Console';

const { getFilePath, saveJsonToFile, decodeBase64, saveTextToFile } =
  frodo.utils;
const { readRealms } = frodo.realm;
const { readScripts, readScriptByName } = frodo.script;

type ByName = { scriptName: string };
type BySkeleton = { ss: ScriptSkeleton };

/**
 * Export script using its name
 * @param criteria Name of the script not including extension
 */
export async function exportScript(
  criteria: ByName,
  justContent: boolean,
  justConfig: boolean
): Promise<boolean>;
/**
 * Export script using the provided ScriptSkeleton
 * @param criteria Script object skeleton
 */
export async function exportScript(
  criteria: BySkeleton,
  justContent: boolean,
  justConfig: boolean
): Promise<boolean>;
/**
 * Export script in fr-config-manager format
 * @param criteria Either ScriptSkeleton or string
 * @returns True if export was successful
 */
export async function exportScript(
  criteria: ByName | BySkeleton,
  justContent: boolean = false,
  justConfig: boolean = false
): Promise<boolean> {
  try {
    const s: ScriptSkeleton =
      'ss' in criteria
        ? criteria.ss
        : await readScriptByName(criteria.scriptName);
    verboseMessage(`    Exporting ${s.name} script`);

    // script is in base64 in ScriptSkeleton so decode
    const decodedScript: string = decodeBase64(
      Array.isArray(s.script) ? s.script.join('\n') : s.script
    );
    const fileExtension: string =
      s.language === 'JAVASCRIPT' ? '.js' : '.groovy';
    const relScriptPath: string = `scripts-content/${s.context}/${s.name}${fileExtension}`;

    if (!justContent) {
      // create config file for the script
      const fileObj = {
        file: justConfig ? `${s.name}${fileExtension}` : relScriptPath,
      };
      delete s.script;
      saveJsonToFile(
        { ...s, script: fileObj },
        getFilePath(
          `realms/${state.getRealm()}/scripts/scripts-config/${s._id}.json`,
          true
        ),
        false,
        false
      );
    }

    if (justConfig) {
      // dont create script file
      return true;
    }

    // create script file
    saveTextToFile(
      decodedScript,
      getFilePath(`realms/${state.getRealm()}/scripts/${relScriptPath}`, true)
    );

    return true;
  } catch (error) {
    printError(
      error,
      'scriptName' in criteria
        ? `Script "${criteria.scriptName}" was not found is in the realm "${state.getRealm()}"`
        : ''
    );
    return false;
  }
}

/**
 * Export all scripts from the current realm set in state
 * @param prefix If set, will look only for scripts that start with prefix
 * @param justContent If set, will only export the actual script file, not config
 * @param justConfig If set, will only export a scripts config file
 * @param scriptType If set, will only export the one script and its config file unless just-content is specified
 * @param language If set, will only export scripts that are in a certain programming language, by default, only js files
 * @returns True if export was successful
 */
export async function exportRealmScripts(
  prefix: string = null,
  justContent: boolean = false,
  justConfig: boolean = false,
  scriptType: string = null,
  language: string = 'JAVASCRIPT'
): Promise<boolean> {
  try {
    // create scripts directory if it doesnt exist even if there are no scripts, thats what fr-config-manager does
    getFilePath(`realms/${state.getRealm()}/scripts/`, true);
    let allScripts: ScriptSkeleton[] = await readScripts();

    // get scripts that start with prefix
    if (prefix) {
      allScripts = allScripts.filter((ss) => ss.name.startsWith(prefix));
      if (allScripts.length === 0) {
        verboseMessage(
          `There are no scripts that start with "${prefix}" in the ${state.getRealm()} realm.`
        );
        return true;
      }
    }

    // get scripts that are of a certain type
    if (scriptType) {
      allScripts = allScripts.filter((ss) => ss.context === scriptType);
      if (allScripts.length === 0) {
        verboseMessage(
          `There are no scripts of type "${scriptType}" in the ${state.getRealm()} realm.`
        );
        return true;
      }
    }

    // get scripts written in specfic programming language
    language = language ? language.toUpperCase() : null;
    if (language !== 'JAVASCRIPT') {
      // if all is set as the language, don't modify scripts list
      if (language !== 'ALL') {
        if (language !== 'GROOVY') {
          verboseMessage(`"${language}" is not a valid programming language`);
          return true;
        }
        allScripts = allScripts.filter((ss) => ss.language === 'GROOVY');
        if (allScripts.length === 0) {
          verboseMessage(
            `There are no scripts written in groovy in the ${state.getRealm()} realm.`
          );
          return true;
        }
      }
    } else {
      allScripts = allScripts.filter((ss) => ss.language === 'JAVASCRIPT');
      if (allScripts.length === 0) {
        verboseMessage(
          `There are no scripts written in javascript in the ${state.getRealm()} realm.`
        );
        return true;
      }
    }

    // if there are no scripts, return
    if (allScripts.length !== 0) {
      for (const s of allScripts) {
        if (!(await exportScript({ ss: s }, justContent, justConfig))) {
          return false;
        }
      }
    } else {
      verboseMessage(`There are no scripts in the realm "${state.getRealm()}"`);
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Export all scripts from all realms
 * @returns True if export was successful
 */
export async function exportAllScripts(
  prefix: string = null,
  justContent: boolean = false,
  justConfig: boolean = false,
  scriptType: string = null,
  language: string = null
): Promise<boolean> {
  try {
    for (const realm of await readRealms()) {
      state.setRealm(realm.name);
      verboseMessage(`\n${state.getRealm()} realm:`);
      if (
        !(await exportRealmScripts(
          prefix,
          justContent,
          justConfig,
          scriptType,
          language
        ))
      ) {
        return false;
      }
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
