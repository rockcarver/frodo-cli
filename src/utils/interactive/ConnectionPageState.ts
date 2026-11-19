/**
 * The decisions of the connection page (decision record 0046), split into a
 * zero-import module the way ReadyStep and PassLogin are: the page
 * (ConnectionPagePrompt) and the resolution pass (cli/ResolveInteractiveInputs)
 * both read them, and the unit tests cannot import either.
 *
 * The connection page is where the user settles who logs in to what: the host,
 * the credentials and, once the login has shown that the system has several
 * realms, the realm. It logs in itself when Done is pressed on a complete page
 * and a realm picker may follow (record 0001), says so on the Done row, and
 * stays open for the realm; with no realm to choose it concludes as soon as the
 * login succeeded.
 */

import { createHash } from 'node:crypto';

/** The rows of the connection page that hold a value the user can type. */
export type ConnectionFieldKey = 'host' | 'username' | 'password';

/** A row of the connection page. */
export type ConnectionPageRow = {
  /** Stable identifier the caller maps values back from. */
  key: ConnectionFieldKey;
  label: string;
  /**
   * Current value as resolved by the caller so far (profile, env, CLI).
   * Password rows render masked regardless.
   */
  value?: string;
  /** Where the value came from, e.g. "from profile prod". */
  note?: string;
};

/** One realm the user can choose on the page. */
export type RealmRowChoice = {
  value: string;
  name: string;
  description?: string;
};

/**
 * The Realm row: what the system offers once the login has shown it has more
 * than one realm. The row shows `defaultText` with the note "default" until the
 * user chooses.
 */
export type RealmRow = {
  label: string;
  /** The choice that keeps the system's default (the realm the deployment type maps to, or every realm). */
  defaultValue: string;
  /** What the row shows while nothing is chosen. */
  defaultText: string;
  choices: RealmRowChoice[];
  /** The question of the choice box. */
  message: string;
};

/** What a login on the page left behind: who is logged in, and for which rows. */
export type PageConnection = {
  who?: string;
  /** `connectionSnapshot` of the rows the login was made with. */
  snapshot: string;
};

/**
 * The rows the login depends on, as a one-way hash kept in memory: it tells
 * whether the user edited the host or a credential after the login, which drops
 * the session and the realm choice (record 0046).
 * @param rows the rows of the page
 * @returns the snapshot
 */
export function connectionSnapshot(rows: ConnectionPageRow[]): string {
  const values: Record<string, string> = {};
  for (const row of rows) values[row.key] = row.value ?? '';
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

/**
 * Whether the page holds everything a login needs: every row it shows has a
 * value. A page that is not complete cannot log in; Done concludes it as it
 * always did and the command fails on the missing input.
 * @param rows the rows of the page
 * @returns true when every row has a value
 */
export function pageComplete(rows: ConnectionPageRow[]): boolean {
  return rows.length > 0 && rows.every((row) => !!row.value);
}

/** What Enter says on the Done row. */
export type DoneLabel = 'connect' | 'next';

/**
 * What Enter says on the Done row (records 0043 and 0044): `connect` while a
 * login is still to be made by this press, `next` otherwise, because more
 * follows (the Ready step at least).
 * @param facts.logsIn the page logs in when it is complete (a realm picker may follow)
 * @param facts.complete the page holds everything a login needs
 * @param facts.connected the page is logged in for the rows it shows now
 * @returns the label
 */
export function doneLabel(facts: {
  logsIn: boolean;
  complete: boolean;
  connected: boolean;
}): DoneLabel {
  return facts.logsIn && facts.complete && !facts.connected
    ? 'connect'
    : 'next';
}

/** What the pass does with the page after Done. */
export type AfterDone = 'conclude' | 'login';

/**
 * What follows Done: the page concludes when it is logged in for the rows it
 * shows (the realm, if any, was chosen), when it does not log in (no realm
 * picker can follow, record 0044: no picker, no login in the pass) or when it is
 * incomplete; otherwise the login runs on the page.
 * @param facts.logsIn the page logs in when it is complete
 * @param facts.complete the page holds everything a login needs
 * @param facts.connected the page is logged in for the rows it shows now
 * @returns 'login' or 'conclude'
 */
export function afterDone(facts: {
  logsIn: boolean;
  complete: boolean;
  connected: boolean;
}): AfterDone {
  return facts.logsIn && facts.complete && !facts.connected
    ? 'login'
    : 'conclude';
}

/** What follows a successful login on the page. */
export type AfterLogin = 'conclude' | 'choose-realm';

/**
 * What follows a successful login: the page stays open for the realm when the
 * system has more than one, and concludes at once otherwise (one realm, or the
 * realms could not be read: the default is kept, record 0001).
 * @param hasRealmRow the system has several realms, so the page has a Realm row
 * @returns 'choose-realm' or 'conclude'
 */
export function afterLogin(hasRealmRow: boolean): AfterLogin {
  return hasRealmRow ? 'choose-realm' : 'conclude';
}

/**
 * What the status line of the page says about a failed login: the headline of
 * the error and what the system said about it ("Error getting tokens: Login
 * failure"), the `Message:` line of a network error when there is one, else the
 * `Reason:` line, else the last line. The whole error and its hint are printed
 * when the page is closed.
 * @param message the message of the error, with its causes on lines of their own
 * @returns one line
 */
export function failureSummary(message: string): string {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return 'unknown error';
  const first = lines[0];
  const said = (label: string) =>
    lines
      .find((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`))
      ?.slice(label.length + 1)
      .trim();
  const detail = said('Message') || said('Reason') || lines[lines.length - 1];
  return detail === first ? first : `${first}: ${detail}`;
}

/**
 * The choices of the realm box that match what the user typed: a
 * case-insensitive substring of the name.
 * @param choices all the choices
 * @param query what was typed
 * @returns the matching choices, in order
 */
export function filterRealmChoices(
  choices: RealmRowChoice[],
  query: string
): RealmRowChoice[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return choices;
  return choices.filter((choice) => choice.name.toLowerCase().includes(needle));
}

/**
 * The realm the row stands for after a choice: choosing the default keeps it
 * (the row says "default" again and nothing is written).
 * @param realm the row of the page
 * @param chosen the value that was chosen
 * @returns the value to keep, undefined for the default
 */
export function realmAfterChoice(
  realm: RealmRow,
  chosen: string
): string | undefined {
  return chosen === realm.defaultValue ? undefined : chosen;
}
