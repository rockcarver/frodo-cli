// import { CircleOfTrustSkeleton } from "@rockcarver/frodo-lib/types/api/ApiTypes";
import { TypesRaw } from '@rockcarver/frodo-lib';

/**
 * Get a one-line description of the circle of trust object
 * @param {CircleOfTrustSkeleton} cotObj circle of trust object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(cotObj: TypesRaw.CircleOfTrustSkeleton): string {
  const description = `[${cotObj._id['brightCyan']}]`;
  return description;
}
