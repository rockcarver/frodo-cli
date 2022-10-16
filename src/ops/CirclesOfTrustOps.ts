// import { CircleOfTrustSkeleton } from "@rockcarver/frodo-lib/types/api/ApiTypes";
import { TypesRaw } from '@rockcarver/frodo-lib';

/**
 * Get a one-line description of the circle of trust object
 * @param {CircleOfTrustSkeleton} cotObj circle of trust object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(
  cotObj: TypesRaw.CircleOfTrustSkeleton
): string {
  const description = `[${cotObj._id['brightCyan']}]`;
  return description;
}

/**
 * Get markdown table header
 * @returns {string} markdown table header
 */
export function getTableHeaderMd(): string {
  let markdown = '';
  markdown += '| Name/Id | Status | Trusted Providers |\n';
  markdown += '| ------- | ------ | ----------------- |';
  return markdown;
}

/**
 * Get a table-row of the circle of trust in markdown
 * @param {SocialIdpSkeleton} cotObj circle of trust object to describe
 * @returns {string} a table-row of the circle of trust in markdown
 */
export function getTableRowMd(cotObj: TypesRaw.CircleOfTrustSkeleton): string {
  const row = `| ${cotObj._id} | ${
    cotObj.status === 'active'
      ? ':white_check_mark: `active`'
      : ':o: `inactive`'
  } | ${cotObj.trustedProviders
    .map((provider) => provider.split('|')[0])
    .join('<br>')} |`;
  return row;
}
