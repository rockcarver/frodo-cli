import fs from 'fs';
import { printError, printMessage, verboseMessage } from '../utils/Console';

export type ConfigFileExporter = (filePath: string) => Promise<boolean>;

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
 * when the exporter failed or threw, true when it exported or was skipped)
 */
export function configFileStep(
  label: string,
  fileName: string,
  exporter: ConfigFileExporter,
  { optional = false }: { optional?: boolean } = {}
) {
  return async (options: { configFolder?: string }): Promise<boolean> => {
    if (!existingConfigFile(options.configFolder, fileName)) {
      if (optional) {
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
}
