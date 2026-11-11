/**
 * Terminal-test steps for the connection page (decision record 0046).
 *
 * A flow that has the page log in and then choose a realm goes: Done on a
 * complete page (`connect`), the page opens again with `Connected as <who>` and
 * a `realm` row when the system has several realms, the cursor on Done; Enter on
 * Done keeps the default, Up and Enter open the realms. `wait_plain` scans ALL
 * the output so far, so a scenario that reaches the page twice (an edit of the
 * host after the login) must `clear_output` before it waits for the second one.
 */

/** What the page says once it is logged in. */
export const CONNECTED = 'Connected as';

/** The frame of the page last drawn: a capture holds every frame since the last clear. */
export const lastPage = (plain) => plain.split('┌ Navigate').pop();

/** The keys of the page's own Navigate box, from the frame last drawn. */
export const navigateOf = (frame) => frame.split('└')[0];

/** The footer of a frame: the command as it would run. */
export const footerOf = (frame) => frame.split('└').pop();

const ENTER = { type: 'key', name: 'enter' };
const UP = { type: 'key', name: 'up' };
const DOWN = { type: 'key', name: 'down' };

/**
 * Waits for the page that is logged in, lets it settle and captures it.
 * @param {string} label the capture
 */
export function atConnectedPage(label = 'connected') {
  return [
    { type: 'wait_plain', regex: CONNECTED, timeoutMs: 60000 },
    { type: 'sleep', ms: 500 },
    { type: 'capture', label },
  ];
}

/**
 * On the connected page (the cursor is on Done): opens the realms of the Realm
 * row, captures the box, types `realm` to narrow the list, picks the
 * highlighted one and goes back to Done. Done itself is not pressed.
 * @param {string} realm what to type in the box
 * @param {string} label the capture of the open box
 */
export function pickRealmOnPage(realm, label = 'realms') {
  return [
    UP,
    ENTER,
    { type: 'sleep', ms: 400 },
    { type: 'capture', label },
    { type: 'send', text: realm },
    { type: 'sleep', ms: 300 },
    ENTER,
    { type: 'sleep', ms: 300 },
    DOWN,
    { type: 'sleep', ms: 300 },
  ];
}

/**
 * The credentials of a page that was opened for a host on the command line:
 * the cursor is on the username (the first row without a value); types both,
 * and leaves the cursor on Done.
 * @param {string} username
 * @param {string} password
 */
export function fillCredentials(
  username = 'someone',
  password = 'not-a-password'
) {
  return [
    ENTER,
    { type: 'send', text: username },
    ENTER,
    { type: 'sleep', ms: 300 },
    DOWN,
    ENTER,
    { type: 'send', text: password },
    ENTER,
    { type: 'sleep', ms: 300 },
    DOWN,
    { type: 'sleep', ms: 300 },
  ];
}
