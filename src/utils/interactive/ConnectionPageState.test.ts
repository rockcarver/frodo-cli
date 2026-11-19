import { describe, expect, it } from '@jest/globals';
import {
  afterDone,
  afterLogin,
  connectionSnapshot,
  doneLabel,
  failureSummary,
  filterRealmChoices,
  pageComplete,
  realmAfterChoice,
  type ConnectionPageRow,
  type RealmRow,
} from './ConnectionPageState';

const rowsOf = (
  host?: string,
  username?: string,
  password?: string
): ConnectionPageRow[] => [
  { key: 'host', label: 'host', value: host },
  { key: 'username', label: 'username', value: username },
  { key: 'password', label: 'password', value: password },
];

const realm: RealmRow = {
  label: 'realm',
  defaultValue: 'alpha',
  defaultText: 'alpha',
  choices: [
    { value: 'alpha', name: 'alpha' },
    { value: 'bravo', name: 'bravo' },
    { value: 'Brave', name: 'Brave', description: 'inactive' },
  ],
  message: 'Choose a realm (default: alpha):',
};

describe('connectionSnapshot', () => {
  it('is the same for the same host and credentials, and says nothing about the notes', () => {
    const a = rowsOf('h', 'u', 'p');
    const b = rowsOf('h', 'u', 'p').map((row) => ({ ...row, note: 'x' }));
    expect(connectionSnapshot(a)).toBe(connectionSnapshot(b));
  });

  it.each([
    ['the host', rowsOf('other', 'u', 'p')],
    ['the username', rowsOf('h', 'other', 'p')],
    ['the password', rowsOf('h', 'u', 'other')],
  ])('changes with %s', (_label, changed) => {
    expect(connectionSnapshot(changed)).not.toBe(
      connectionSnapshot(rowsOf('h', 'u', 'p'))
    );
  });

  it('does not hold the password in the clear', () => {
    expect(connectionSnapshot(rowsOf('h', 'u', 'hunter2'))).not.toContain(
      'hunter2'
    );
  });
});

describe('pageComplete', () => {
  it('needs a value in every row', () => {
    expect(pageComplete(rowsOf('h', 'u', 'p'))).toBe(true);
    expect(pageComplete(rowsOf('h', 'u', undefined))).toBe(false);
    expect(pageComplete(rowsOf('h', '', 'p'))).toBe(false);
    expect(pageComplete(rowsOf(undefined, 'u', 'p'))).toBe(false);
  });

  it('holds for a page with the host row only, and for none at all', () => {
    expect(pageComplete([{ key: 'host', label: 'host', value: 'h' }])).toBe(
      true
    );
    expect(pageComplete([])).toBe(false);
  });
});

describe('doneLabel and afterDone', () => {
  it('says connect, and logs in, only when a login is still to be made by this press', () => {
    const facts = { logsIn: true, complete: true, connected: false };
    expect(doneLabel(facts)).toBe('connect');
    expect(afterDone(facts)).toBe('login');
  });

  it('says next, and concludes, after the login', () => {
    const facts = { logsIn: true, complete: true, connected: true };
    expect(doneLabel(facts)).toBe('next');
    expect(afterDone(facts)).toBe('conclude');
  });

  it('says next, and concludes, when no realm picker can follow: no picker, no login in the pass', () => {
    const facts = { logsIn: false, complete: true, connected: false };
    expect(doneLabel(facts)).toBe('next');
    expect(afterDone(facts)).toBe('conclude');
  });

  it('concludes an incomplete page without a login, as it always did', () => {
    const facts = { logsIn: true, complete: false, connected: false };
    expect(doneLabel(facts)).toBe('next');
    expect(afterDone(facts)).toBe('conclude');
  });
});

describe('afterLogin', () => {
  it('stays open for a realm when the system has several, concludes at once otherwise', () => {
    expect(afterLogin(true)).toBe('choose-realm');
    expect(afterLogin(false)).toBe('conclude');
  });
});

describe('failureSummary', () => {
  it('names the headline and the message the system gave', () => {
    expect(
      failureSummary(
        'Error getting tokens\n  Error authenticating user\n    Network error:\n      Status: 401\n      Code: ERR_BAD_REQUEST\n      Reason: Unauthorized\n      Message: Login failure'
      )
    ).toBe('Error getting tokens: Login failure');
  });

  it('falls back to the reason, then to the last line', () => {
    expect(
      failureSummary(
        'Error getting tokens\n  Status: 401\n  Reason: Unauthorized'
      )
    ).toBe('Error getting tokens: Unauthorized');
    expect(failureSummary('Error getting tokens\n  Login failure')).toBe(
      'Error getting tokens: Login failure'
    );
  });

  it('is the line itself when there is only one', () => {
    expect(failureSummary('Login failure')).toBe('Login failure');
    expect(failureSummary('\n  \n only \n')).toBe('only');
  });

  it('never returns an empty status', () => {
    expect(failureSummary('')).toBe('unknown error');
    expect(failureSummary('  \n ')).toBe('unknown error');
  });
});

describe('filterRealmChoices', () => {
  it('keeps every choice for an empty query', () => {
    expect(filterRealmChoices(realm.choices, '')).toHaveLength(3);
    expect(filterRealmChoices(realm.choices, '   ')).toHaveLength(3);
  });

  it('matches a substring of the name without regard to case, in order', () => {
    expect(
      filterRealmChoices(realm.choices, 'BRA').map((choice) => choice.value)
    ).toEqual(['bravo', 'Brave']);
    expect(filterRealmChoices(realm.choices, 'alp')).toHaveLength(1);
  });

  it('matches nothing for a query that is in no name', () => {
    expect(filterRealmChoices(realm.choices, 'zzz')).toEqual([]);
  });
});

describe('realmAfterChoice', () => {
  it('keeps the default when the default is chosen', () => {
    expect(realmAfterChoice(realm, 'alpha')).toBeUndefined();
  });

  it('keeps any other realm', () => {
    expect(realmAfterChoice(realm, 'bravo')).toBe('bravo');
  });
});
