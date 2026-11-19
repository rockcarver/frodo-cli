import fs from 'fs';
import path from 'path';
import { frodo, state } from '@rockcarver/frodo-lib';

const { getFilePath } = frodo.utils;

/** The options of the library that choose which catalog to read. */
export type CatalogOptions = NonNullable<
  Parameters<typeof frodo.app.template.readCatalog>[0]
>;

/** The catalogs of the CDN. */
export type CatalogChannel = NonNullable<CatalogOptions['channel']>;

/** What the commands that read the application template catalog share. */
export type CatalogSource = {
  /** A file that holds the catalog (`--templates`): the decoded JSON or the gzip file as the CDN serves it. */
  templates?: string;
  /** Which catalog of the CDN to read when there is no file (`--channel`). */
  channel?: string;
};

/**
 * The catalog the user asked for, as the library takes it: the bytes of the
 * file given with `--templates` (the library reads gzip and plain JSON, and
 * checks the size and the shape), else the catalog of the channel, else the
 * default of the library (the production catalog of the CDN). A file is the
 * only source that works while air-gapped mode is on.
 * @param {CatalogSource} source the options of the command
 * @returns {CatalogOptions} the options of the library
 * @throws {Error} if the file cannot be read
 */
export function catalogOptionsOf(source: CatalogSource): CatalogOptions {
  const options: CatalogOptions = {};
  if (source.templates) {
    const filePath = getFilePath(source.templates);
    try {
      options.catalog = new Uint8Array(fs.readFileSync(filePath));
    } catch (error) {
      throw new Error(
        `Cannot read the catalog file ${filePath}: ${(error as Error).message}`,
        { cause: error }
      );
    }
  } else if (source.channel) {
    options.channel = source.channel as CatalogChannel;
  }
  return options;
}

/**
 * Keep the application template catalog between runs. The library keeps it in
 * `~/.frodo/AppTemplates` and asks the CDN with the validators of the kept
 * copy, so a catalog that did not change is not downloaded again and a copy
 * younger than an hour is not even asked about. It is on for every run, and
 * there is no switch to turn it off: air-gapped mode is how a user stops the
 * requests. It lives in the folder `AppTemplates` of the folder of frodo
 * (`FRODO_CONFIG_PATH`, else `~/.frodo`).
 */
export function enableTemplateCatalogCache(): void {
  state.setUseTemplateCatalogCache(true);
  // the folder of the other files of frodo moves with FRODO_CONFIG_PATH; the
  // library's own default is ~/.frodo/AppTemplates
  const configPath = process.env['FRODO_CONFIG_PATH'];
  if (configPath) {
    state.setTemplateCatalogCachePath(path.join(configPath, 'AppTemplates'));
  }
}
