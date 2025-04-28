import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { VariableSkeleton } from '@rockcarver/frodo-lib/types/api/cloud/VariablesApi';
import { v4 as uuidv4 } from 'uuid';
import { getIdmImportExportOptions } from '../ops/IdmOps';
import {
  createProgressIndicator,
  debugMessage,
  printError,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import fs from 'fs';
import * as path from 'path';
import { MappingExportOptions } from '@rockcarver/frodo-lib/types/ops/MappingOps';
import { ScriptExportOptions } from '@rockcarver/frodo-lib/types/ops/ScriptOps';
import { SecretSkeleton } from '@rockcarver/frodo-lib/types/api/cloud/SecretsApi';
import { SecretsExportInterface } from '@rockcarver/frodo-lib/types/ops/cloud/SecretsOps';
import { ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ScriptApi';

const { exportConfigEntity } = frodo.idm.config;
const { exportMappings} = frodo.idm.mapping;
const { exportScripts} = frodo.script;
const { getFilePath, getTypedFilename, saveJsonToFile, getCurrentRealmName } = frodo.utils;
const { readVariables } = frodo.cloud.variable;
const {
  readSecrets,
  createSecret: _createSecret,
  exportSecret,
  createVersionOfSecret: _createVersionOfSecret,
  deleteSecret: _deleteSecret,
  deleteVersionOfSecret: _deleteVersionOfSecret,
} = frodo.cloud.secret;
const {
  readThemes,
  deleteTheme: _deleteTheme,
  deleteThemeByName: _deleteThemeByName,
  deleteThemes: _deleteThemes,
} = frodo.theme;

const { getFullServices, createServiceExportTemplate } = frodo.service;

function processMappings(mappings, targetDir, name) {
  try {
    mappings.forEach((mapping) => {
      if (name && name !== mapping.name) {
        return;
      }

      const mappingPath = `${targetDir}`;

      if (!fs.existsSync(mappingPath)) {
        fs.mkdirSync(mappingPath, { recursive: true });
      }

      Object.entries(mapping).forEach(([key, value]) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          'type' in value &&
          'source' in value &&
          value.type === 'text/javascript'
        ) {
          const scriptFilename = `${mapping.name}.${key}.js`;
          (value as any).file = scriptFilename; // Replace source code with file reference
          fs.writeFileSync(
            path.join(mappingPath, scriptFilename),
            (value as any).source
          );
          delete (value as any).source;
        }
      });

      const fileName = `${mappingPath}/${mapping.name}.json`;
      saveJsonToFile(mapping, fileName, false);
    });
  } catch (err) {
    console.error(err);
  }
}

/**
 * Export all mappings to separate files in fr-config-manager format
 * @param {MappingExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportMappings(
  options: MappingExportOptions = {
    deps: true,
    useStringArrays: true,
  }
): Promise<boolean> {
  try {
    const exportData = await exportMappings(options);
    const fileDir = `sync/mappings`;
    for (const mapping of Object.values(exportData.sync.mappings)) {
      processMappings([mapping], `${fileDir}/${mapping.name}`, mapping.name);
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting mappings to files`);
  }
  return false;
}

function saveScriptToFile(script: ScriptSkeleton, exportDir: string) {
  const scriptContentRelativePath = `scripts-content/${script.context}`;
  const scriptContentPath = `${exportDir}/${scriptContentRelativePath}`;
  if (!fs.existsSync(scriptContentPath)) {
    fs.mkdirSync(scriptContentPath, { recursive: true });
  }

  const scriptConfigPath = `${exportDir}/scripts-config`;
  if (!fs.existsSync(scriptConfigPath)) {
    fs.mkdirSync(scriptConfigPath, { recursive: true });
  }

  const scriptFilename = `${script.name}.js`;
  let scriptToOutput = script.script
  if (Array.isArray(scriptToOutput)) {
    scriptToOutput = scriptToOutput.join('\n');
  }
  // const buff = Buffer.from(scriptToOutput, "base64");
  // const source = buff.toString("utf-8");
  fs.writeFileSync(`${scriptContentPath}/${scriptFilename}`, scriptToOutput);
  script.script = {
    // @ts-expect-error We export this format but its not in the type
    file: `${scriptContentRelativePath}/${scriptFilename}`,
  };

  const scriptFileName = `${scriptConfigPath}/${script._id}.json`;
  saveJsonToFile(script, scriptFileName);
}

function processScripts(scripts: ScriptSkeleton[], exportDir: string, name: string) {
  try {
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    let scriptNotFound = true;

    for (const script of scripts) {
      if (script.language !== "JAVASCRIPT") {
        continue;
      }

      if (name && name !== script.name) {
        continue;
      }

      scriptNotFound = false;
      
      saveScriptToFile(script, exportDir);
    };

    if (name && scriptNotFound) {
      console.warn("Script not found (check SCRIPT_PREFIXES)");
    }
  } catch (err) {
    console.error(err);
  }
}

/**
 * Export all scripts to individual files in fr-config-manager format
 * @param {ScriptExportOptions} options Export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportScripts(options: ScriptExportOptions): Promise<boolean> {
  debugMessage(`Cli.ScriptOps.exportScriptsToFiles: start`);
  const errors: Error[] = [];
  let barId: string;
  try {
    const fullExportOptions: ScriptExportOptions = {
      ...options,
      includeDefault: true,
    };
    const scriptExport = await exportScripts(fullExportOptions);
    const scriptList = Object.values(scriptExport.script);
    barId = createProgressIndicator(
      'determinate',
      scriptList.length,
      'Exporting scripts to individual files...'
    );
    for (const script of scriptList) {
      const fileBarId = createProgressIndicator(
        'determinate',
        1,
        `Exporting script ${script.name}...`
      );
      const file = getFilePath(getTypedFilename(script.name, 'script'), true);
      try {
        const fileDir =  `realms/${getCurrentRealmName()}/scripts`;
        processScripts([script], fileDir, script.name);
        updateProgressIndicator(fileBarId, `Saving ${script.name} to ${file}.`);
        stopProgressIndicator(fileBarId, `${script.name} saved to ${file}.`);
      } catch (error) {
        stopProgressIndicator(
          fileBarId,
          `Error exporting ${script.name}`,
          'fail'
        );
        errors.push(error);
      }
      updateProgressIndicator(barId, `Exported script ${script.name}`);
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error exporting scripts`, errors);
    }
    stopProgressIndicator(
      barId,
      `Exported ${scriptList.length} scripts to individual files.`
    );
    debugMessage(`Cli.ScriptOps.exportScriptsToFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(barId, `Error exporting scripts`);
    printError(error);
  }
}

/**
 * Export all secrets to individual files in fr-config-manager format
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} includeActiveValues include active value of secret (default: false)
 * @param {string} target Host URL of target environment to encrypt secret value for
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
type FrConfigSecret = SecretSkeleton & {
  valueBase64: string;
}
async function getFrConfigSecrets(): Promise<FrConfigSecret[]> {
  const originalSecrets = await readSecrets();
  return originalSecrets.map(secret => ({
    ...secret,
    valueBase64: `\${${(secret._id).toUpperCase().replace(/-/g, "_")}}`
  }));
}
export async function configManagerExportSecrets(
  target?: string
): Promise<boolean> {
  let secrets: FrConfigSecret[] = [];
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Reading secrets...`
  );
  try {
    secrets = await getFrConfigSecrets();
    secrets.sort((a, b) => a._id.localeCompare(b._id));
    stopProgressIndicator(
      spinnerId,
      `Successfully read ${secrets.length} secrets.`,
      'success'
    );
    const indicatorId = createProgressIndicator(
      'determinate',
      secrets.length,
      'Exporting secrets'
    );
    for (const secret of secrets) {
      const exportData: SecretsExportInterface = await exportSecret(
        secret._id,
        false,
        target
      );
      const [secretKey] = Object.keys(exportData.secret);
      const fullSecret = exportData.secret[secretKey] as FrConfigSecret;
      const cleanSecret = {
        _id: fullSecret._id,
        description: fullSecret.description,
        encoding: fullSecret.encoding,
        useInPlaceholders: fullSecret.useInPlaceholders,
        valueBase64: `\${${(secret._id).toUpperCase().replace(/-/g, "_")}}`
      };
      saveJsonToFile(cleanSecret, getFilePath(`esvs/secrets/${secret._id}.json`, true), false);
      updateProgressIndicator(indicatorId, `Exported secret ${secret._id}`);
    }    
    stopProgressIndicator(
      indicatorId,
      `${secrets.length} secrets exported.`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error exporting secrets to files`,
      'fail'
    );
    printError(error);
  }
  return false;
}


/**
 * Export all services to separate files in fr-config-manager format
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportServices(
  globalConfig: boolean = false,
): Promise<boolean> {
  try {
    debugMessage(`cli.ServiceOps.exportServicesToFiles: start`);
    const services = await getFullServices(globalConfig);
    for (const service of services) {
      const fileDir = `realms/${getCurrentRealmName()}/services`;
      const filePath = getFilePath(`${fileDir}/${service._type._id}.json`, true);
      const exportData = createServiceExportTemplate();
      exportData.service[service._type._id] = { ...service, nextDescendents: undefined };
      debugMessage(
        `cli.ServiceOps.exportServicesToFiles: exporting ${service._type._id} to ${filePath}`
      );
      saveJsonToFile(exportData.service[service._type._id], filePath, false, false);
    }
    debugMessage(`cli.ServiceOps.exportServicesToFiles: end.`);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Determine HTML fields for config-manager style export
 */
const THEME_HTML_FIELDS = [
  { name: 'accountFooter', encoded: false },
  { name: 'journeyFooter', encoded: false },
  { name: 'journeyHeader', encoded: false },
  { name: 'journeyJustifiedContent', encoded: false },
  { name: 'journeyFooterScriptTag', encoded: true },
];

function decodeOrNot(input, encoded) {
  return encoded ? atob(input) : input;
}

/**
 * Process themes (extract HTML fields)
 */
function processThemes(themes, fileDir, name) {
  try {
    themes.forEach((theme) => {
      if (name && name !== theme.name) {
        return;
      }
      const themePath = `${fileDir}`;

      if (!fs.existsSync(themePath)) {
        fs.mkdirSync(themePath, { recursive: true });
      }

      for (const field of THEME_HTML_FIELDS) {
        if (!theme[field.name]) {
          continue;
        }

        switch (typeof theme[field.name]) {
          case 'string':
            {
              const fieldFilename = `${field.name}.html`;
              const breakoutFile = path.join(themePath, fieldFilename);
              fs.writeFileSync(
                breakoutFile,
                decodeOrNot(theme[field.name], field.encoded)
              );
              theme[field.name] = {
                file: fieldFilename,
              };
            }
            break;

          case 'object':
            // eslint-disable-next-line no-case-declarations
            const fieldPath = path.join(themePath, field.name);
            if (!fs.existsSync(fieldPath)) {
              fs.mkdirSync(fieldPath, { recursive: true });
            }

            Object.keys(theme[field.name]).forEach((locale) => {
              {
                const localeFilename = path.join(field.name, `${locale}.html`);
                const breakoutFile = path.join(themePath, localeFilename);
                fs.writeFileSync(
                  breakoutFile,
                  decodeOrNot(theme[field.name][locale], field.encoded)
                );
                theme[field.name][locale] = {
                  file: localeFilename,
                };
              }
            });
            break;

          default:
            console.error(
              `Error processing theme ${theme.name} - unexpected data type for ${field.name}: ${typeof theme[field.name]}`
            );
            process.exit(1);
        }
      }

      const fileName = `${themePath}/${theme.name}.json`;
      saveJsonToFile(theme, fileName, false);
    });
  } catch (err) {
    console.error(err);
  }
}

/**
 * Export all themes to separate files in fr-config-manager format
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportThemes() {
  let barId: string;
  try {
    const themes = await readThemes();
    barId = createProgressIndicator(
      'determinate',
      themes.length,
      'Exporting themes'
    );
    for (const theme of themes) {
      if (!theme._id) theme._id = uuidv4();
      const fileBarId = createProgressIndicator(
        'determinate',
        1,
        `Exporting theme ${theme.name}...`
      );
      updateProgressIndicator(barId, `Exporting theme ${theme.name}`);
      const fileDir = `realms/${getCurrentRealmName()}/themes/${theme.name}`;
      const file = getFilePath(`${fileDir}/${theme.name}.json`, true);
      processThemes([theme], fileDir, theme.name);
      updateProgressIndicator(fileBarId, `${theme.name} saved to ${file}`);
      stopProgressIndicator(fileBarId, `${theme.name} saved to ${file}.`);
    }
    return true;
  } catch (error) {
    stopProgressIndicator(barId, `Error exporting themes`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export all variables to seperate files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportVariablesToFiles(): Promise<boolean> {
  let spinnerId: string;
  let indicatorId: string;
  let variableList: VariableSkeleton[] = [];
  try {
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Retrieving variables...`
    );
    variableList = await readVariables();
    stopProgressIndicator(
      spinnerId,
      `Successfully retrieved ${variableList.length} variables`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error retrieving variables`, 'fail');
    printError(error);
    return false;
  }
  try {
    const indicatorId = createProgressIndicator(
      'determinate',
      variableList.length,
      'Exporting variables'
    );
    for (const variable of variableList) {
      const envVariable = esvToEnv(variable._id);

      const variableObject = {
        _id: variable._id,
        expressionType: variable.expressionType,
        description: escapePlaceholders(variable.description),
        valueBase64: '${' + envVariable + '}',
      };

      saveJsonToFile(
        variableObject,
        getFilePath(`esvs/variables/${variable._id}.json`, true),
        false
      );
      updateProgressIndicator(indicatorId, `Writing variable ${variable._id}`);
    }
    stopProgressIndicator(
      indicatorId,
      `${variableList.length} variables exported`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting variables`);
    printError(error);
  }
  return false;
}

/**
 * Export an IDM configuration object.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportConfigEntityToFile(
  envFile?: string
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = (
      await exportConfigEntity('ui/configuration', {
        envReplaceParams: options.envReplaceParams,
        entitiesToExport: undefined,
      })
    ).idm['ui/configuration'];

    saveJsonToFile(
      exportData,
      getFilePath('ui-configuration.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ui-configuration`);
  }
  return false;
}

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportUiConfig(
  envFile?: string
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = (
      await exportConfigEntity('ui/configuration', {
        envReplaceParams: options.envReplaceParams,
        entitiesToExport: undefined,
      })
    ).idm['ui/configuration'];

    saveJsonToFile(
      exportData,
      getFilePath('ui/ui-configuration.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ui-configuration`);
  }
  return false;
}

function escapePlaceholders(content: string): string {
  return JSON.parse(JSON.stringify(content).replace(/\$\{/g, '\\\\${'));
}

function esvToEnv(esv: string): string {
  return esv.toUpperCase().replace(/-/g, '_');
}
