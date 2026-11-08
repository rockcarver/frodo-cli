/**
 * What went wrong, in one line, for the reason of a failure in a summary (see
 * `OperationRun`). A FrodoError of the library wraps the error that caused it,
 * and its own message only says what was being done ("Error deleting alpha realm
 * themes"). The line worth showing is at the bottom of that chain: the message
 * the server answered with (the deepest `httpMessage`), otherwise the message of
 * the innermost error.
 * @param {unknown} error the error that was caught
 * @returns {string} the first line of the cause
 */
export function causeOf(error: unknown): string {
  type Link = {
    message?: string;
    httpMessage?: string;
    originalErrors?: unknown[];
  };
  let link = error as Link;
  let httpMessage = '';
  for (;;) {
    if (typeof link?.httpMessage === 'string' && link.httpMessage) {
      httpMessage = link.httpMessage;
    }
    if (!Array.isArray(link?.originalErrors) || !link.originalErrors.length) {
      break;
    }
    link = link.originalErrors[0] as Link;
  }
  const text =
    httpMessage ||
    (typeof link?.message === 'string' ? link.message : String(link));
  return text.split('\n')[0].trim();
}
