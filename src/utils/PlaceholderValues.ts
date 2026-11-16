/**
 * Where the value of a `${NAME}` placeholder in a file that the config-manager
 * commands push comes from, said once so that the help texts that mention
 * placeholders cannot say different things. A test checks that they contain it
 * and that it is still true: the library fills a placeholder from the values
 * that `-E/--env` and `--env-file` put into its state and, for a push, last from
 * the environment variable of the process (the switch of the library's state
 * that the config-manager push commands turn on, see
 * `FrodoCommand.fillsPlaceholdersFromProcessEnvironment`).
 */
export const PLACEHOLDER_VALUES_RULE =
  'is filled from -E/--env NAME=value, else from --env-file, else from the environment variable NAME of the process (a file that names a variable copies its value into what is pushed).';

/** The rule as a sentence of its own. */
export const PLACEHOLDER_VALUES_SENTENCE = `Each \${NAME} ${PLACEHOLDER_VALUES_RULE}`;
