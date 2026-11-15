/**
 * What the help of the generic agent commands (`frodo agent list|describe|export|delete`)
 * says about the kinds that are not agents of those commands.
 *
 * The library hands the generic agent code every type the realm lists except the types
 * that have a module of their own: OAuth2 clients, trusted JWT issuers and CIMD profiles
 * (core record 0022). Each of them has its own command family, so a person who looks for
 * one under `agent` is told where it is. The wording lives here so that the four commands
 * and the test that pins it say the same thing.
 */

/** The commands that hold what the generic agent commands leave out, one per kind. */
export const OWN_COMMANDS = [
  'frodo oauth client',
  'frodo oauth issuer',
  'frodo oauth cimd',
] as const;

/** The kinds the generic agent commands do not handle. */
const KINDS = 'OAuth2 clients, trusted JWT issuers and CIMD profiles';

/** One sentence for the description of `agent list`, `describe`, `export` and `delete`. */
export const NOT_AGENTS_OF_THIS_COMMAND = `${KINDS} are not agents of this command: see ${OWN_COMMANDS[0]}, ${OWN_COMMANDS[1]} and ${OWN_COMMANDS[2]}.`;

/**
 * The clause that follows the text of a bulk option (`delete -a`, `export -a|-A`): what
 * the option leaves out and which commands to use for it.
 *
 * @param verb the verb of the replacement commands
 * @param flag the bulk option of the replacement commands
 */
export function notAgentsOfBulkOption(
  verb: 'delete' | 'export',
  flag: '-a' | '-A'
): string {
  const left = verb === 'delete' ? 'deleted' : 'included';
  const [client, issuer, cimd] = OWN_COMMANDS.map(
    (command) => `${command} ${verb} ${flag}`
  );
  return `${KINDS} are not ${left}: use ${client}, ${issuer} and ${cimd}.`;
}
