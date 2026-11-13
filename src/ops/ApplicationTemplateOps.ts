import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import {
  catalogOptionsOf,
  type CatalogChannel,
  type CatalogSource,
} from '../utils/ApplicationTemplateSource';
import { createTable, printError, printMessage } from '../utils/Console';
import { printErrorHint } from '../utils/ErrorCodeHints';

// The application template catalog has a library module of its own. Every
// library symbol this file uses is named here, so a rename is one line.
const {
  listTemplates,
  readCatalog,
  readTemplate: readTemplateInLibrary,
} = frodo.app.template;

const { getFilePath, saveTextToFile } = frodo.utils;

/** The catalog of the library together with what is known about it. */
type CatalogResult = Awaited<ReturnType<typeof readCatalog>>;

/** One template version of the merged list. */
type TemplateListItem = Awaited<ReturnType<typeof listTemplates>>[number];

/** The name of the file `download` saves to when it is not given one. */
export const DEFAULT_CATALOG_FILE = 'appTemplates.json';

/**
 * The number of template versions and of product groups of a catalog.
 * @param {CatalogResult['catalog']} catalog the catalog
 * @returns {{ templates: number; groups: number }} the counts
 */
export function countCatalog(catalog: CatalogResult['catalog']): {
  templates: number;
  groups: number;
} {
  let templates = 0;
  let groups = 0;
  for (const tier of Object.values(catalog.AppTemplates ?? {})) {
    for (const group of Object.values(tier ?? {})) {
      groups++;
      templates += Object.keys(group ?? {}).length;
    }
  }
  return { templates, groups };
}

/**
 * List the application templates: the ids, or with `long` a table of the
 * versions. The templates of the tenant are merged over the catalog when a
 * connection to the tenant was made.
 * @param {CatalogSource & { long?: boolean; includeOverrides?: boolean }} options which catalog to read, whether to list all fields, and whether the tenant's templates are merged in
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listApplicationTemplates(
  options: CatalogSource & { long?: boolean; includeOverrides?: boolean }
): Promise<boolean> {
  try {
    const items = await listTemplates({
      ...catalogOptionsOf(options),
      includeOverrides: options.includeOverrides === true,
    });
    if (options.long) {
      const table = createTable([
        'Id',
        'Name',
        'Group',
        { hAlign: 'right', content: 'Version' },
        'Type',
        'Override',
        'Newest',
        'Updated',
        'Display name',
      ]);
      items.forEach((item) => {
        table.push([
          item.templateId,
          item.name,
          item.group ?? '',
          { hAlign: 'right', content: item.templateVersion },
          item.templateType ?? '',
          item.isOverride ? 'yes' : '',
          item.newestInGroup ? 'yes' : '',
          (item.dateUpdated ?? '').slice(0, 10),
          item.displayName ?? '',
        ]);
      });
      printMessage(table.toString(), 'data');
    } else {
      items.forEach((item) => {
        printMessage(item.templateId, 'data');
      });
    }
    return true;
  } catch (error) {
    printError(error);
    printErrorHint(error);
  }
  return false;
}

/**
 * Find the version of the list whose id is the one given. Ids are not
 * case-sensitive.
 * @param {TemplateListItem[]} items the merged list
 * @param {string} templateId the id the user gave
 * @returns {TemplateListItem | undefined} the version, if there is one
 */
function findTemplate(
  items: TemplateListItem[],
  templateId: string
): TemplateListItem | undefined {
  const wanted = templateId.toLowerCase();
  return items.find((item) => item.templateId.toLowerCase() === wanted);
}

/**
 * Describe an application template: a summary of the version, or with `json`
 * the whole template (the form definition and the connector defaults).
 * @param {string} templateId the id of the version, for example `3_3-azure-ad`
 * @param {CatalogSource & { json?: boolean; includeOverrides?: boolean }} options which catalog to read, whether to print the whole template, and whether the tenant's templates are merged in
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeApplicationTemplate(
  templateId: string,
  options: CatalogSource & { json?: boolean; includeOverrides?: boolean }
): Promise<boolean> {
  try {
    const libraryOptions = {
      ...catalogOptionsOf(options),
      includeOverrides: options.includeOverrides === true,
    };
    const item = findTemplate(await listTemplates(libraryOptions), templateId);
    if (!item) {
      printMessage(`Application template ${templateId} not found.`, 'error');
      return false;
    }
    const resolution = await readTemplateInLibrary(
      { templateName: item.name, templateVersion: item.templateVersion },
      libraryOptions
    );
    const template = resolution.template;
    if (!template) {
      printMessage(
        `Application template ${item.templateId} could not be read.`,
        'error'
      );
      return false;
    }
    if (options.json) {
      printMessage(JSON.stringify(template, null, 2), 'data');
      return true;
    }
    const description = template['description'];
    const supportUrl = template['supportUrl'];
    const lines: [string, string | undefined][] = [
      ['Id', item.templateId],
      ['Name', item.name],
      ['Display name', item.displayName],
      [
        'Group',
        item.group ? `${item.group} (${item.tier})` : `(none, ${item.tier})`,
      ],
      ['Version', item.templateVersion],
      ['Newest version', item.newestInGroup ? 'yes' : 'no'],
      ['Type', item.templateType],
      ['Updated', item.dateUpdated],
      ['Defined by the tenant', item.isOverride ? 'yes' : 'no'],
      ['Description', typeof description === 'string' ? description : ''],
      ['Support URL', typeof supportUrl === 'string' ? supportUrl : ''],
    ];
    lines
      .filter(([, value]) => value)
      .forEach(([label, value]) => {
        printMessage(`${label}: ${value}`, 'data');
      });
    return true;
  } catch (error) {
    printError(error);
    printErrorHint(error);
  }
  return false;
}

/**
 * Download the application template catalog and save it to a file, for a
 * machine that cannot reach the CDN. The library keeps the catalog in a
 * cache (the CLI switches it on at start) and the request is conditional, so
 * a catalog that did not change is not downloaded again. The file is the
 * decoded catalog as the library keeps it, unchanged: the text of the cached
 * file is copied. It can be given to `--templates` on the other machine.
 * @param {string | undefined} file the file to save to; default `appTemplates.json` in the working directory
 * @param {string | undefined} channel which catalog of the CDN: production (default) or development
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function downloadApplicationTemplateCatalog(
  file?: string,
  channel?: string
): Promise<boolean> {
  try {
    const { catalog, metadata } = await readCatalog({
      refresh: true,
      ...(channel ? { channel: channel as CatalogChannel } : {}),
    });
    const filePath = getFilePath(file || DEFAULT_CATALOG_FILE, true);
    const cached =
      metadata.cachePath && fs.existsSync(metadata.cachePath)
        ? fs.readFileSync(metadata.cachePath, 'utf8')
        : undefined;
    saveTextToFile(cached ?? JSON.stringify(catalog, null, 2), filePath);
    const { templates, groups } = countCatalog(catalog);
    if (!file) {
      printMessage(
        `No file given: saved as ${DEFAULT_CATALOG_FILE} in the working directory.`,
        'info'
      );
    }
    printMessage(`Saved the application template catalog to ${filePath}.`);
    printMessage(`  Templates: ${templates} versions in ${groups} groups`);
    printMessage(`  Source: ${metadata.source.location}`);
    printMessage(`  Cache: ${describeCacheOutcome(metadata)}`);
    if (metadata.etag) printMessage(`  ETag: ${metadata.etag}`);
    if (metadata.lastModified) {
      printMessage(`  Last-Modified: ${metadata.lastModified}`);
    }
    if (metadata.fetchedAt) printMessage(`  Checked: ${metadata.fetchedAt}`);
    if (metadata.cacheError) {
      printMessage(
        `The source could not be used (${metadata.cacheError}), so this is the copy kept earlier.`,
        'warn'
      );
    }
    printMessage(
      `To use it on a machine that cannot reach the internet, copy the file there and pass it with --templates <file>.`,
      'info'
    );
    return true;
  } catch (error) {
    printError(error);
    printErrorHint(error);
  }
  return false;
}

/**
 * What the cache did for a read, in words.
 * @param {CatalogResult['metadata']} metadata what is known about the catalog
 * @returns {string} one line
 */
export function describeCacheOutcome(
  metadata: CatalogResult['metadata']
): string {
  const words: Record<CatalogResult['metadata']['cache'], string> = {
    disabled: 'not used',
    miss: 'downloaded (there was no kept copy)',
    fresh: 'the kept copy is recent, nothing was requested',
    revalidated: 'unchanged at the source, nothing was downloaded',
    refreshed: 'a newer catalog was downloaded and kept',
    'stale-after-error':
      'the source could not be used, the copy kept earlier is used',
    offline: 'air-gapped mode is on, the kept copy was used without a request',
  };
  const where = metadata.cachePath ? ` (${metadata.cachePath})` : '';
  return `${words[metadata.cache]}${where}`;
}
