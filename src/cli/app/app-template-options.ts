import { Option } from 'commander';

/**
 * The option that names a file with the application template catalog. It is
 * the only source of the catalog while air-gapped mode is on, and it is shared
 * by the commands that read the catalog (`frodo app template list`,
 * `describe`, and later `frodo app validate`). It names a file to read, so
 * `src/utils/interactive/PathOptions.ts` classifies it and the resolution pass
 * gives it the file system picker (record 0045).
 * @returns {Option} a new option for a command to add
 */
export function templatesOption(): Option {
  return new Option(
    '--templates <file>',
    'Read the application template catalog from this file instead of the CDN: the JSON that "frodo app template download" saves, or the gzip file as the CDN serves it. Cannot be used with --channel.'
  ).conflicts(['channel']);
}

/**
 * The option that chooses which catalog of the CDN to read.
 * @returns {Option} a new option for a command to add
 */
export function channelOption(): Option {
  return new Option(
    '--channel <channel>',
    'Which catalog of the CDN to read: production or development (the development catalog holds a few more template versions). Default: production. Cannot be used with --templates.'
  )
    .choices(['production', 'development'])
    .conflicts(['templates']);
}
