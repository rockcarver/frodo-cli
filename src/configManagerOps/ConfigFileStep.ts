import fs from 'fs';
import { printError, verboseMessage } from '../utils/Console';

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
 * file lists what to pull. The exporter throws when the file is missing, which
 * must not abort the other steps.
 * @param label what the step exports, for the messages
 * @param fileName name of the file in the config folder
 * @param exporter the export function, called with the path of the file
 * @param settings `optional`: skip the step quietly when the file does not exist,
 * for items that most config folders do not have, instead of reporting an error
 * @returns the step: it never throws
 */
export function configFileStep(
  label: string,
  fileName: string,
  exporter: ConfigFileExporter,
  { optional = false }: { optional?: boolean } = {}
) {
  return async (options: { configFolder?: string }): Promise<void> => {
    if (optional && !existingConfigFile(options.configFolder, fileName)) {
      verboseMessage(`Skipping ${label}: no ${fileName} in the config folder.`);
      return;
    }
    try {
      await exporter(`${options.configFolder}/${fileName}`);
    } catch (err) {
      printError(
        err,
        `Error exporting ${label}, Please make sure the config file name is ${fileName} in the config folder.`
      );
    }
  };
}
