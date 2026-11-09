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

/**
 * Whether the server answered a read with "404 Not Found". A FrodoError of the
 * library wraps the error that caused it, and a read that calls another read
 * wraps twice, so every link of the chain is asked, at any depth. Only a
 * confirmed 404 counts: a refused request (401, 403), a server error or a
 * network failure is not "nothing there" and must still fail.
 * @param {unknown} error the error that was caught
 * @returns {boolean} true if the error or any error it wraps is an HTTP 404
 */
export function isNotFoundError(error: unknown): boolean {
  type Link = {
    httpStatus?: unknown;
    response?: { status?: unknown };
    originalErrors?: unknown;
  };
  const seen = new Set<unknown>();
  const visit = (link: unknown): boolean => {
    if (!link || typeof link !== 'object' || seen.has(link)) return false;
    seen.add(link);
    const { httpStatus, response, originalErrors } = link as Link;
    if (httpStatus === 404 || response?.status === 404) return true;
    return Array.isArray(originalErrors) && originalErrors.some(visit);
  };
  return visit(error);
}
