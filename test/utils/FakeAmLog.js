import fs from 'fs';

/**
 * Reads the request log a fake AM wrote (`recordPath` of `startFakeAm`, one JSON
 * line per request: `{ method, url, body }`) and answers the questions the
 * login tests ask about it. The log keeps the order of the requests, so
 * "before" and "after" are positions in the returned array.
 */

/** Every request, in order. Empty when nothing was requested. */
export function readRequests(recordPath) {
  if (!fs.existsSync(recordPath)) return [];
  return fs
    .readFileSync(recordPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * Whether a request starts a login: the authenticate call that carries no
 * callbacks, which is what begins the journey. A login is one such call,
 * whatever the journey asks after it.
 */
export function startsLogin(request) {
  if (!request.url.includes('/authenticate')) return false;
  const posted = request.body ? JSON.parse(request.body) : {};
  return !posted.callbacks;
}

/** How many logins the requests hold. */
export function loginCount(requests) {
  return requests.filter(startsLogin).length;
}

/** The position of the first request whose URL contains `text`, -1 when there is none. */
export function firstRequestIndex(requests, text) {
  return requests.findIndex((request) => request.url.includes(text));
}

/** The position of the first login, -1 when there is none. */
export function firstLoginIndex(requests) {
  return requests.findIndex(startsLogin);
}
