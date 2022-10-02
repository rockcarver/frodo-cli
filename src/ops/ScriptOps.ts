import { ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';

/**
 * Get a one-line description of the script object
 * @param {ScriptSkeleton} scriptObj script object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(scriptObj: ScriptSkeleton): string {
  const description = `[${scriptObj._id['brightCyan']}] ${scriptObj.context} - ${scriptObj.name}`;
  return description;
}
