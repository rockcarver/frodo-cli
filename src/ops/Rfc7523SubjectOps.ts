import { frodo, state, type Writable } from '@rockcarver/frodo-lib';
import { padCell, singleLine, truncate } from '../utils/TextLayout';

const { readOAuth2TrustedJwtIssuer } = frodo.oauth2oidc.issuer;
const { queryManagedObjects, countManagedObjects } = frodo.idm.managed;
const { readUsers, countUsers } = frodo.user;
const { getCurrentRealmManagedUser } = frodo.utils;
const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

/**
 * The users a RFC7523 assertion can be made for, as the `--sub` picker of
 * `frodo admin execute-rfc7523-authz-grant-flow` offers them (cli#1004). The
 * subject is the user's id in the realm, so the picker row shows who the id
 * belongs to. The reads are plain ops: the prompts are in the picker.
 */

/** A realm with up to this many users is listed whole. */
export const SUBJECT_LIST_LIMIT = 1000;
/** A search that finds more users than this asks for a longer text. */
export const SUBJECT_MATCH_LIMIT = 200;

const IDM_FIELDS = ['userName', 'givenName', 'sn', 'mail'];
const AM_FIELDS = ['username', 'givenName', 'sn', 'mail'];
const USER_COLUMN = 28;
const NAME_COLUMN = 32;

export type SubjectCandidate = {
  /** The user's id: what `--sub` gets. */
  id: string;
  userName?: string;
  givenName?: string;
  sn?: string;
  mail?: string;
  /** The picker row: username, first and last name, id. */
  row: string;
};

/** A string literal in an IDM query filter. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function fullName(candidate: Pick<SubjectCandidate, 'givenName' | 'sn'>) {
  return singleLine(`${candidate.givenName ?? ''} ${candidate.sn ?? ''}`);
}

/** Whether every word of the query is found in one of the user's fields. */
export function subjectMatches(
  candidate: SubjectCandidate,
  query: string
): boolean {
  const fields = [
    candidate.userName,
    candidate.givenName,
    candidate.sn,
    fullName(candidate),
    candidate.mail,
    candidate.id,
  ]
    .filter(Boolean)
    .map((field) => field.toLowerCase());
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => fields.some((field) => field.includes(word)));
}

/**
 * The query filter behind the search-first step: a prefix of a name field or
 * the email, or the whole id. IDM calls the username attribute `userName`, the
 * AM users endpoint filters it as `uid`.
 */
export function subjectSearchFilter(
  text: string,
  userNameAttribute = 'userName'
): string {
  const quoted = quote(text);
  const parts = [
    `${userNameAttribute} sw ${quoted}`,
    `givenName sw ${quoted}`,
    `sn sw ${quoted}`,
    `mail sw ${quoted}`,
    `_id eq ${quoted}`,
  ];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    parts.push(
      `(givenName sw ${quote(words[0])} and sn sw ${quote(words.slice(1).join(' '))})`
    );
  }
  return parts.join(' or ');
}

/** A string attribute, or the first of a list (AM returns every attribute as a list). */
function text(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first ? singleLine(first) : undefined;
}

function toCandidate(
  id: string,
  user: {
    userName?: unknown;
    givenName?: unknown;
    sn?: unknown;
    mail?: unknown;
  }
): SubjectCandidate {
  return {
    id,
    userName: text(user.userName),
    givenName: text(user.givenName),
    sn: text(user.sn),
    mail: text(user.mail),
    row: '',
  };
}

/**
 * Where the users are read from. Identity Cloud and ForgeOps keep them in
 * IDM's managed user object; a classic deployment has no IDM, so the AM users
 * endpoint answers instead. Both give the picker the same candidates.
 */
type UserDirectory = {
  count(filter: string): Promise<number>;
  read(filter: string): Promise<SubjectCandidate[]>;
  searchFilter(text: string): string;
};

function userDirectory(): UserDirectory {
  if (state.getDeploymentType() === CLASSIC_DEPLOYMENT_TYPE_KEY) {
    return {
      count: (filter) => countUsers(filter),
      read: async (filter) =>
        (await readUsers(filter, AM_FIELDS)).map((user) =>
          toCandidate(user._id, {
            userName: user.username,
            givenName: user.givenName,
            sn: user.sn,
            mail: user.mail,
          })
        ),
      searchFilter: (value) => subjectSearchFilter(value, 'uid'),
    };
  }
  const type = getCurrentRealmManagedUser();
  return {
    count: (filter) => countManagedObjects(type, filter),
    read: async (filter) =>
      (await queryManagedObjects(type, filter, IDM_FIELDS)).map((user) =>
        toCandidate(user._id, {
          userName: user['userName'],
          givenName: user['givenName'],
          sn: user['sn'],
          mail: user['mail'],
        })
      ),
    searchFilter: (value) => subjectSearchFilter(value),
  };
}

/** Sets the rows of a list: the columns line up within the list. */
export function subjectRows(
  candidates: SubjectCandidate[]
): SubjectCandidate[] {
  const none = '-';
  const names = candidates.map((candidate) => ({
    user: truncate(singleLine(candidate.userName ?? none), USER_COLUMN),
    name: truncate(fullName(candidate) || none, NAME_COLUMN),
  }));
  const userWidth = Math.max(...names.map((n) => n.user.length), 0);
  const nameWidth = Math.max(...names.map((n) => n.name.length), 0);
  return candidates.map((candidate, index) => ({
    ...candidate,
    row: `${padCell(names[index].user, userWidth)}  ${padCell(names[index].name, nameWidth)}  ${singleLine(candidate.id)}`,
  }));
}

/** The subjects the trusted issuer allows; undefined when it cannot be read. */
async function readAllowedSubjects(
  issuerId: string
): Promise<string[] | undefined> {
  try {
    const issuer = await readOAuth2TrustedJwtIssuer(issuerId);
    return (issuer.allowedSubjects as Writable<string[]>)?.value ?? [];
  } catch {
    return undefined;
  }
}

/**
 * Where the candidates for `--sub` come from. The users to offer depend on
 * the trusted issuer `<client id>-issuer`: when it lists the subjects it
 * allows, those are the choice; otherwise (any user, or no such issuer) it is
 * the realm's users.
 */
export function createSubjectSource(getClientId: () => string) {
  let allowed: Promise<string[] | undefined> | undefined;
  const allowedSubjects = () =>
    (allowed ??= readAllowedSubjects(`${getClientId()}-issuer`));

  return {
    /** The realm has too many users to list whole and nothing narrows it. */
    async tooMany(): Promise<boolean> {
      if ((await allowedSubjects())?.length) return false;
      return (await userDirectory().count('true')) > SUBJECT_LIST_LIMIT;
    },

    /** The allowed subjects, or the realm's users when the issuer allows any. */
    async list(): Promise<SubjectCandidate[]> {
      const directory = userDirectory();
      const ids = await allowedSubjects();
      if (ids?.length) {
        const users = await directory.read(
          ids.map((id) => `_id eq ${quote(id)}`).join(' or ')
        );
        // an allowed subject that is no longer a user of the realm is still offered
        return subjectRows(
          ids.map(
            (id) => users.find((user) => user.id === id) ?? toCandidate(id, {})
          )
        );
      }
      return subjectRows(await directory.read('true'));
    },

    /** The realm's users that match the text, or a message when there are too many. */
    async search(text: string): Promise<SubjectCandidate[] | string> {
      const directory = userDirectory();
      const filter = directory.searchFilter(text);
      const found = await directory.count(filter);
      if (found > SUBJECT_MATCH_LIMIT) {
        return `${found} users match '${text}'. Type more of the username, name or email.`;
      }
      return subjectRows(await directory.read(filter));
    },
  };
}
