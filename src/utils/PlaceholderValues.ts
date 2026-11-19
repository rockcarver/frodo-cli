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

/**
 * What a pull does with a key set that holds a private or secret key (decision record 0055, core
 * record 0013), for the help of the pull commands of the kinds that have a `jwkSet`.
 */
export const KEY_SET_PULL_SENTENCE =
  'A key set that holds a private or secret key is not written: the file has ${<ID>_JWKSET} in its place (the id of the object in upper case) and a warning says so.';

/** What a push does with that placeholder, for the help of the push commands of the same kinds. */
export const KEY_SET_PUSH_SENTENCE =
  'A file that has ${<ID>_JWKSET} as its key set (a pull writes it for a key set with a private or secret key) is filled from that variable, which holds the key set as JSON text.';

/**
 * What `pull applications` does with a key set of the OAuth2 client of an application that holds a
 * private or secret key (decision record 0055): the variable follows the convention of the
 * application folder, as the one of the client secret does.
 */
export const APPLICATION_KEY_SET_PULL_SENTENCE =
  'A key set of the OAuth2 client that holds a private or secret key is not written: oauth2-client.json has ${APP_<NAME>_JWKSET} in its place (the name of the application in upper case, as in APP_<NAME>_CLIENT_SECRET) and a warning says so.';

/** What `push applications` does with that placeholder. */
export const APPLICATION_KEY_SET_PUSH_SENTENCE =
  'A key set that a pull replaced by ${APP_<NAME>_JWKSET} is filled from that variable, which holds the key set as JSON text.';
