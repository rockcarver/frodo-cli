import { SocialIdpSkeleton } from "@rockcarver/frodo-lib/types/api/ApiTypes";

/**
 * Get a one-line description of the social idp object
 * @param {SocialIdpSkeleton} socialIdpObj social idp object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(socialIdpObj: SocialIdpSkeleton): string {
  const description = `[${socialIdpObj._id['brightCyan']}] ${socialIdpObj._type._id}`;
  return description;
}
