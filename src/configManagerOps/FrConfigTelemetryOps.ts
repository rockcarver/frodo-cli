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
 * Deletes telemetry exporters: the ones of a category, one exporter by its id,
 * or all of them. The exporters are read once and deleted one by one, so that
 * an exporter that cannot be deleted is reported and does not hide the others.
 * An exporter without an id is never handed to the library, which takes a
 * missing id for "every exporter of the category".
 * @param {TelemetryExporterCategory} category optional exporter category (`otlp` or `splunk`). If omitted (undefined), the exporters of every category are targeted.
 * @param {string} name optional exact exporter id. If omitted (undefined), every exporter of the category is targeted; an empty name names no exporter: it is not found, and it never means "all".
 * @param {boolean} dryRun show which exporters would be deleted without deleting them
 * @param {boolean} allowFailures true to succeed although some exporters could not be deleted (the failures are still summarised)
 * @returns {Promise<boolean>} false if a named exporter does not exist, the exporters cannot be read, or an exporter cannot be deleted (unless failures are allowed for a deletion). Nothing to delete is a success when no exporter was named.
 */
export async function configManagerDeleteTelemetry(
  category?: TelemetryExporterCategory,
  name?: string,
  dryRun = false,
  allowFailures = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'telemetry exporter', allowFailures });
  let telemetry: Awaited<ReturnType<typeof readTelemetry>>;
  try {
    telemetry = await readTelemetry();
  } catch (error) {
    printError(error);
    return false;
  }
  const selected: { category: string; exporter: LogExporterSkeleton }[] = [];
  const seen = new Set<string>();
  for (const [exporterCategory, exporters] of Object.entries(telemetry ?? {})) {
    if (category !== undefined && exporterCategory !== category) continue;
    if (!Array.isArray(exporters)) continue;
    for (const exporter of exporters as LogExporterSkeleton[]) {
      if (name !== undefined && exporter?.id !== name) continue;
      // the library deletes every exporter of that id and category at once, so an id is deleted once
      const key = `${exporterCategory}/${exporter?.id}`;
      if (typeof exporter?.id === 'string' && seen.has(key)) continue;
      seen.add(key);
      selected.push({ category: exporterCategory, exporter });
    }
  }
  if (selected.length === 0) {
    if (name !== undefined) {
      printMessage(
        `Telemetry exporter '${name}' not found${category ? ` in category '${category}'` : ''}.`,
        'error'
      );
      return false;
    }
    printMessage(
      `No telemetry exporters found to delete${category ? ` in category '${category}'` : ''}.`,
      'warn'
    );
    return true;
  }
  for (const { category: exporterCategory, exporter } of selected) {
    const id = exporter?.id;
    if (typeof id !== 'string' || id.trim() === '') {
      // never call the library without an id: it would delete the whole category
      const label = `${exporterCategory}/(no id)`;
      printMessage(
        `Cannot delete a telemetry exporter without an id: ${label}`,
        'error'
      );
      run.recordFailure(label, 'the exporter has no id');
      continue;
    }
    const label = `${exporterCategory}/${id}`;
    if (dryRun) {
      printMessage(`Dry run: Deleting telemetry exporter: ${label}`);
      continue;
    }
    try {
      const deleted = await deleteTelemetry(
        id,
        exporterCategory as TelemetryExporterCategory
      );
      if (Array.isArray(deleted) && deleted.length === 0) {
        // it was there when the exporters were read and is gone now: nothing was deleted by this run
        printMessage(
          `Telemetry exporter ${label} was already gone, nothing to delete.`,
          'warn'
        );
      } else {
        printMessage(`Deleted telemetry exporter: ${label}`);
      }
      run.recordSuccess();
    } catch (error) {
      // the library's error does not name the exporter
      printError(error, `Error deleting telemetry exporter ${label}`);
      run.recordFailure(label, causeOf(error));
    }
  }
  return run.finish();
}
