import { state } from '@rockcarver/frodo-lib';
import {
  createSubjectSource,
  subjectMatches,
  subjectRows,
  subjectSearchFilter,
} from '../../src/ops/Rfc7523SubjectOps.ts';

// The users the --sub picker of execute-rfc7523-authz-grant-flow offers
// (cli#1004): how a row reads, what typing matches, and the query filter of
// the search-first step. The reads themselves are covered through the built
// CLI against a fake AM (Rfc7523Prompts.pty.test.js).

const alice = {
  id: 'u-aaa',
  userName: 'alice',
  givenName: 'Alice',
  sn: 'Smith',
  mail: 'Alice.Smith@Example.com',
  row: '',
};

describe('subjectMatches()', () => {
  test.each([
    ['username', 'alice'],
    ['first name', 'ali'],
    ['last name', 'smith'],
    ['full name', 'alice smith'],
    ['words of the full name in any order', 'smith alice'],
    ['email', 'example.com'],
    ['id', 'u-aa'],
    ['a different case', 'ALICE'],
  ])('finds a user by %s', (_what, query) => {
    expect(subjectMatches(alice, query)).toBe(true);
  });

  test.each([
    ['text that is in no field', 'bob'],
    ['one word that matches and one that does not', 'alice jones'],
  ])('does not match %s', (_what, query) => {
    expect(subjectMatches(alice, query)).toBe(false);
  });

  test('a user without names or email still matches by id', () => {
    expect(subjectMatches({ id: 'u-xyz', row: '' }, 'xyz')).toBe(true);
    expect(subjectMatches({ id: 'u-xyz', row: '' }, 'alice')).toBe(false);
  });
});

describe('subjectRows()', () => {
  test('lines the columns up and puts the id last', () => {
    const rows = subjectRows([
      alice,
      {
        id: 'u-bbb',
        userName: 'bartholomew',
        givenName: 'Bob',
        sn: 'Jones',
        row: '',
      },
    ]).map((candidate) => candidate.row);
    expect(rows).toEqual([
      'alice        Alice Smith  u-aaa',
      'bartholomew  Bob Jones    u-bbb',
    ]);
  });

  test('shows a dash for what a user does not have', () => {
    const [row] = subjectRows([{ id: 'u-xyz', row: '' }]);
    expect(row.row).toBe('-  -  u-xyz');
  });

  test('keeps a row on one line and cuts a long column, whatever the tenant stored', () => {
    const [row] = subjectRows([
      {
        id: 'u-hostile',
        userName: `line one\nline two\t${'x'.repeat(100)}`,
        givenName: 'A\r\nB',
        sn: 'C',
        row: '',
      },
    ]);
    expect(row.row).not.toMatch(/[\r\n\t]/);
    expect(row.row.split('  ')[0].length).toBeLessThanOrEqual(28);
    expect(row.row.endsWith('u-hostile')).toBe(true);
  });
});

describe('subjectSearchFilter()', () => {
  test('matches the start of the name fields and the email, or the whole id', () => {
    expect(subjectSearchFilter('ali')).toBe(
      'userName sw "ali" or givenName sw "ali" or sn sw "ali" or mail sw "ali" or _id eq "ali"'
    );
  });

  test('two words also match first name and last name', () => {
    expect(subjectSearchFilter('alice sm')).toContain(
      '(givenName sw "alice" and sn sw "sm")'
    );
  });

  test('quotes and backslashes in the text cannot end the string', () => {
    const filter = subjectSearchFilter('a"b\\c');
    expect(filter).toContain('userName sw "a\\"b\\\\c"');
    expect(filter.match(/ or /g)).toHaveLength(4);
  });
});

describe('createSubjectSource() without IDM', () => {
  afterEach(() => state.setDeploymentType(undefined));

  test('a classic deployment offers no users and never counts', async () => {
    state.setDeploymentType('classic');
    const source = createSubjectSource(() => 'c1');
    await expect(source.list()).resolves.toEqual([]);
    await expect(source.tooMany()).resolves.toBe(false);
  });
});
