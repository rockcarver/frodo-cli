/**
 * Where the value of a `${NAME}` placeholder in a file that the config-manager
 * commands push comes from, said once so that the help texts that mention
 * placeholders cannot say different things. A test checks that they contain it
 * and that it is still true: the library fills a placeholder from the values
 * that `-E/--env` and `--env-file` put into its state, and from nowhere else.
 */
export const PLACEHOLDER_VALUES_RULE =
  'is filled from -E/--env NAME=value or from --env-file (-E wins); the environment variables of the process are not read.';

/** The rule as a sentence of its own. */
export const PLACEHOLDER_VALUES_SENTENCE = `Each \${NAME} ${PLACEHOLDER_VALUES_RULE}`;
