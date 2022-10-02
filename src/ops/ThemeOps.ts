import { ThemeSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';

/**
 * Get a one-line description of the theme
 * @param {ThemeSkeleton} themeObj theme object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(themeObj: ThemeSkeleton): string {
  const description = `[${themeObj._id['brightCyan']}] ${
    themeObj.name
  }${
    themeObj.linkedTrees
      ? ' (' + themeObj.linkedTrees.join(', ')['brightCyan'] + ')'
      : ''
  }`;
  return description;
}
