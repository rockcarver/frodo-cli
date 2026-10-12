import fs from 'fs';
import {
  frodo,
  type LogExporterSkeleton,
  type TelemetryExporterCategory,
  type TelemetryExportInterface,
} from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';

const { saveJsonToFile, getFilePath, readJsonFile } = frodo.utils;
const { exportTelemetry, importTelemetry, readTelemetry, deleteTelemetry } =
  frodo.cloud.telemetry;

/**
 * Exports telemetry configuration in config manager format
 * @param {TelemetryExporterCategory} category optional parameter to export telemetry by category.
 * @param {string} name optional parameter to export telemetry config by name.
 * @param {boolean} allowFailures true to succeed although some exporters could not be exported (the failures are still summarised)
 * @returns { Promise<boolean> } returns false if a named exporter does not exist, the telemetry cannot be read, or an exporter cannot be exported (unless failures are allowed). No exporters when none was named is a success.
 */
export async function configManagerExportTelemetry(
  category?: TelemetryExporterCategory,
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const exporters = await exportTelemetry(name, category);
    const items = Object.entries(exporters.telemetry).flatMap(
      ([cat, providers]) => providers.map((provider) => ({ cat, provider }))
    );
    if (name && items.length === 0) {
      printMessage(`Telemetry exporter '${name}' not found.`, 'error');
      return false;
    }
    if (items.length === 0) {
      printMessage('No telemetry exporters found to export.');
      return true;
    }
    const run = new OperationRun({ unit: 'telemetry exporter', allowFailures });
    for (const { cat, provider } of items) {
      try {
        const exportProvider = provider as any;
        if (exportProvider.headers) {
          const placeholders: Record<string, string> = {};
          Object.keys(exportProvider.headers).forEach((headerName) => {
            placeholders[headerName] =
              `\${TELEMETRY_HEADER_${cat}_${provider.id}_${headerName}}`
                .replaceAll('-', '_')
                .toUpperCase();
          });
          exportProvider.headers = placeholders;
        }
        saveJsonToFile(
          exportProvider,
          getFilePath(`telemetry/${cat}/${provider.id}.json`, true),
          false
        );
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error exporting telemetry exporter ${provider.id}`);
        run.recordFailure(`${cat}/${provider.id}`, causeOf(error));
      }
    }
    return run.finish();
  } catch (e) {
    printError(e);
  }
  return false;
}

/**
 * Imports telemetry configuration in config manager format
 * @param {TelemetryExporterCategory} category optional parameter to import telemetry by category.
 * @param {string} name optional parameter to import telemetry config by name.
 * @param {boolean} allowFailures true to succeed although some exporters could not be imported (the failures are still summarised)
 * @returns { Promise<boolean> } returns false if the telemetry folder or a named exporter does not exist, or an exporter cannot be read or imported (unless failures are allowed). No exporters when none was named is a success.
 */
export async function configManagerImportTelemetry(
  category?: TelemetryExporterCategory,
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  let indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Reading telemetry exporters...`
  );

  try {
    const telemetryDir = getFilePath('telemetry');

    if (!fs.existsSync(telemetryDir)) {
      stopProgressIndicator(
        indicatorId,
        `Telemetry folder not found: ${telemetryDir}`,
        'fail'
      );
      return false;
    }

    const categories = fs
      .readdirSync(telemetryDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name as TelemetryExporterCategory)
      .filter((cat) => !category || cat === category);

    const run = new OperationRun({ unit: 'telemetry exporter', allowFailures });
    const exporters: {
      cat: TelemetryExporterCategory;
      id: string;
      provider: LogExporterSkeleton;
    }[] = [];

    for (const cat of categories) {
      const catDir = getFilePath(`telemetry/${cat}`);
      if (!fs.existsSync(catDir)) {
        continue;
      }
      const files = fs
        .readdirSync(catDir)
        .filter((f) => f.toLowerCase().endsWith('.json'))
        .filter((f) => !name || f === `${name}.json`);
      for (const file of files) {
        const filePath = `${catDir}/${file}`;
        try {
          const provider = readJsonFile(filePath) as LogExporterSkeleton;
          exporters.push({
            cat,
            id: `${cat}/${provider.id ?? file}`,
            provider,
          });
        } catch (error) {
          // a file that cannot be read or parsed is a failed exporter
          printError(error, `Error reading telemetry exporter ${cat}/${file}`);
          run.recordFailure(`${cat}/${file}`, causeOf(error));
        }
      }
    }
    if (exporters.length === 0 && !run.hasFailures) {
      if (name) {
        stopProgressIndicator(
          indicatorId,
          `No matching telemetry exporter found for ${name}`,
          'fail'
        );
        return false;
      }
      stopProgressIndicator(
        indicatorId,
        'No telemetry exporters found to import',
        'success'
      );
      return true;
    }

    stopProgressIndicator(
      indicatorId,
      `Successfully read ${exporters.length} telemetry exporter(s).`,
      'success'
    );

    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Importing telemetry exporters...'
    );

    // The library stops at the first exporter it cannot import: one call per
    // exporter tries every one of them.
    for (const { cat, id, provider } of exporters) {
      try {
        await importTelemetry({
          telemetry: { [cat]: [provider] },
        } as TelemetryExportInterface);
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error importing telemetry exporter ${id}`);
        run.recordFailure(id, causeOf(error));
      }
    }

    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? 'Telemetry import completed with failures.'
        : `Successfully imported ${exporters.length} telemetry exporter(s).`,
      run.hasFailures ? 'fail' : 'success'
    );

    return run.finish();
  } catch (error) {
    stopProgressIndicator(indicatorId, `Failed to import Telemetry.`, 'fail');
    printError(error, 'Error importing telemetry configuration');
    return false;
  }
}

/**
 * Deletes telemetry exporters in config manager format
 * @param {TelemetryExporterCategory} category optional exporter category
 * @param {string} name optional exporter name
 * @param {boolean} dryRun whether to simulate deletion
 * @returns {Promise<boolean>} true if deletion succeeded
 */
export async function configManagerDeleteTelemetry(
  category?: TelemetryExporterCategory,
  name?: string,
  dryRun = false,
  allowFailures = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'telemetry', allowFailures });
  try {
    const matches = Object.entries(await readTelemetry())
      .filter(([cat]) => category === undefined || category === cat)
      .flatMap(([cat, exporters]) =>
        Object.values(exporters)
          .filter((exporter) => name === undefined || name === exporter.id)
          .map((exporter: LogExporterSkeleton) => ({
            category: cat as TelemetryExporterCategory,
            id: exporter.id,
          }))
      );
    if (matches.length === 0) {
      printMessage('Warning: telemetry config not found', 'warn');
      return true;
    }
    for (const { id, category: exporterCategory } of matches) {
      const label = `${exporterCategory}/${id}`;
      if (!dryRun) {
        try {
          await deleteTelemetry(id, exporterCategory);
        } catch (error) {
          printError(error, `Failed to delete telemetry config: ${label}`);
          run.recordFailure(label, causeOf(error));
          continue;
        }
      }

      printMessage(
        `${dryRun ? 'Dry run: ' : ''}Deleted telemetry config: ${label}`
      );
      run.recordSuccess();
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Failed to delete telemetry config');
    run.finish();
    return false;
  }
}
