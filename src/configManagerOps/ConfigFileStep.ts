import fs from 'fs';
import { printError, printMessage, verboseMessage } from '../utils/Console';

export type ConfigFileExporter = (filePath: string) => Promise<boolean>;

/** What a step needs to know about the config folder. */
export interface ConfigFileStepOptions {
  configFolder?: string;
  /**
   * True when the config folder does not exist or is not a folder (see {@link configFolderProblem}) and
   * the command has said so once. The step then skips quietly, because its own warning would only repeat
   * that.
   */
  configFolderUnusable?: boolean;
}

/** Says which file a step reads from the config folder, for the one warning about a config folder that is not there. */
export interface ConfigFileStepInfo {
  /** The name of the file in the config folder. */
  fileName: string;
  /** True for a file that most config folders do not have: its step skips quietly even when the folder is there. */
  optional: boolean;
}

/** A step that reads a file from the config folder, with the file it reads. */
export type ConfigFileStepRun = ((
  options: ConfigFileStepOptions
) => Promise<boolean>) & { configFile: ConfigFileStepInfo };

/**
 * The file a step reads from the config folder, if it is a step made by {@link configFileStep}.
 * @param {unknown} run the function of a step
 * @returns {ConfigFileStepInfo | undefined} the file, or undefined for any other step
 */
export function configFileOf(run: unknown): ConfigFileStepInfo | undefined {
  return (run as Partial<ConfigFileStepRun>)?.configFile;
}

/**
 * Whether the config folder that was given can hold config files at all: it has to exist and to be a
 * folder. A folder that is not there is almost always a mistyped path, and every step that reads a file
 * from it would say so on its own.
 * @param {string | undefined} configFolder the config folder, if one was given
 * @returns {'missing' | 'not-a-folder' | undefined} what is wrong with it, or undefined when it is fine or none was given
 */
export function configFolderProblem(
  configFolder: string | undefined
): 'missing' | 'not-a-folder' | undefined {
  if (!configFolder) return undefined;
  try {
    return fs.statSync(configFolder).isDirectory() ? undefined : 'not-a-folder';
  } catch {
    return 'missing';
  }
}

/**
 * The path of a file in the config folder when the file exists, otherwise
 * `null`. For configuration that is exported without any input and only
 * enriched by an optional file, such as the CSP overrides.
 * @param configFolder the config folder, if one was given
 * @param fileName name of the file in the config folder
 * @returns the path of the file, or null if there is no such file
 */
export function existingConfigFile(
  configFolder: string | undefined,
  fileName: string
): string | null {
  if (!configFolder) return null;
  const filePath = `${configFolder}/${fileName}`;
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * A step of `config-manager pull all` that reads a file from the config folder
 * to know what to export. These are the dynamic items (authz policy sets,
 * OAuth2 clients, SAML entity providers, service objects) and raw config, whose
 * file lists what to pull. The file is found by its name, not asked for, so a
 * config folder without it has nothing for this step to export: the step is
 * skipped with a warning, which is not a failure (decision record 0040). A file
 * that exists but cannot be read or processed is a failure of this step, and an
 * exporter that throws must not abort the other steps.
 * @param label what the step exports, for the messages
 * @param fileName name of the file in the config folder
 * @param exporter the export function, called with the path of the file
 * @param settings `optional`: skip the step quietly (only in the verbose
 * output) when the file does not exist, for items that most config folders do
 * not have, instead of with a warning
 * @returns the step: it never throws, and it answers whether it succeeded (false
 * when the exporter failed or threw, true when it exported or was skipped). It
 * carries the file it reads as `configFile`. When the command has found the
 * config folder unusable (`configFolderUnusable`) it has said so once, and the
 * step skips quietly.
 */
export function configFileStep(
  label: string,
  fileName: string,
  exporter: ConfigFileExporter,
  { optional = false }: { optional?: boolean } = {}
) {
  const run = async (options: ConfigFileStepOptions): Promise<boolean> => {
    if (!existingConfigFile(options.configFolder, fileName)) {
      if (optional || options.configFolderUnusable) {
        verboseMessage(
          `Skipping ${label}: no ${fileName} in the config folder.`
        );
      } else {
        printMessage(
          `Skipping ${label}: no ${fileName} in ${
            options.configFolder
              ? `'${options.configFolder}'`
              : 'the config folder'
          }.`,
          'warn'
        );
      }
      return true;
    }
    try {
      return (await exporter(`${options.configFolder}/${fileName}`)) !== false;
    } catch (err) {
      printError(
        err,
        `Error exporting ${label}, please make sure ${fileName} in the config folder can be read and has the expected content.`
      );
      return false;
    }
  };
  return Object.assign(run, { configFile: { fileName, optional } });
}
