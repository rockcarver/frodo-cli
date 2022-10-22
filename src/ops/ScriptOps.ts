import { ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { ExportImportUtils } from '@rockcarver/frodo-lib';

/**
 * Get a one-line description of the script object
 * @param {ScriptSkeleton} scriptObj script object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(scriptObj: ScriptSkeleton): string {
  const description = `[${scriptObj._id['brightCyan']}] ${scriptObj.context} - ${scriptObj.name}`;
  return description;
}

/**
 * Get markdown table header
 * @returns {string} markdown table header
 */
export function getTableHeaderMd(): string {
  let markdown = '';
  markdown += '| Name | Language | Type | Id |\n';
  markdown += '| ---- | -------- | ---- | ---|';
  return markdown;
}

/**
 * Get a one-line description of the script object in markdown
 * @param {ScriptSkeleton} scriptObj script object to describe
 * @returns {string} markdown table row
 */
export function getTableRowMd(scriptObj: ScriptSkeleton): string {
  const langMap = { JAVASCRIPT: 'JavaSscript', GROOVY: 'Groovy' };
  const description = `| ${scriptObj.name} | ${
    langMap[scriptObj.language]
  } | ${ExportImportUtils.titleCase(
    scriptObj.context.split('_').join(' ')
  )} | \`${scriptObj._id}\` |`;
  return description;
}
