/**
 * The sentence that the help of a standalone pull kind gains: what it leaves out in a tree that
 * uses the application layout.
 * @param {string} what what an application owns that this kind would pull, in the plural: "OAuth2 clients"
 * @returns {string} the help text, to be added after the help of the command
 */
export function ownedObjectsHelp(what: string): string {
  return `\nIn a tree that uses one folder per application (see frodo config-manager pull applications), ${what} that an application owns are not pulled here: they are named and skipped, and the folder of the application holds them.\n`;
}

/**
 * The sentence that the help of a standalone push kind gains: what it leaves out in a tree that
 * uses the application layout.
 * @param {string} what what an application owns that this kind would push, in the plural: "OAuth2 clients"
 * @returns {string} the help text, to be added after the help of the command
 */
export function ownedObjectsPushHelp(what: string): string {
  return `\nIn a tree that uses one folder per application (see frodo config-manager push applications), ${what} that an application owns are not pushed here: they are named and skipped, and "push applications" pushes them from the folder of the application.\n`;
}
