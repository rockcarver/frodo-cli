import {
  frodo,
  state,
  type IdObjectSkeletonInterface,
  type Writable,
} from '@rockcarver/frodo-lib';
import { padCell, singleLine, truncate } from '../utils/TextLayout';

const { readOAuth2TrustedJwtIssuer } = frodo.oauth2oidc.issuer;
const { queryManagedObjects, countManagedObjects } = frodo.idm.managed;
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

const FIELDS = ['userName', 'givenName', 'sn', 'mail'];
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

/** The IDM query filter behind the search-first step: a prefix of a field, or the id. */
export function subjectSearchFilter(text: string): string {
  const quoted = quote(text);
  const parts = [
    `userName sw ${quoted}`,
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

function toCandidate(
  id: string,
  user?: IdObjectSkeletonInterface
): SubjectCandidate {
  const text = (name: string): string | undefined => {
    const value = user?.[name];
    return typeof value === 'string' && value ? singleLine(value) : undefined;
  };
  return {
    id,
    userName: text('userName'),
    givenName: text('givenName'),
    sn: text('sn'),
    mail: text('mail'),
    row: '',
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
 * the realm's users. A deployment without IDM (classic) offers none: the
 * command then asks for `--sub`.
 */
export function createSubjectSource(getClientId: () => string) {
  let allowed: Promise<string[] | undefined> | undefined;
  const allowedSubjects = () =>
    (allowed ??= readAllowedSubjects(`${getClientId()}-issuer`));
  const hasIdm = () =>
    state.getDeploymentType() !== CLASSIC_DEPLOYMENT_TYPE_KEY;

  return {
    /** The realm has too many users to list whole and nothing narrows it. */
    async tooMany(): Promise<boolean> {
      if (!hasIdm() || (await allowedSubjects())?.length) return false;
      return (
        (await countManagedObjects(getCurrentRealmManagedUser(), 'true')) >
        SUBJECT_LIST_LIMIT
      );
    },

    /** The allowed subjects, or the realm's users when the issuer allows any. */
    async list(): Promise<SubjectCandidate[]> {
      if (!hasIdm()) return [];
      const type = getCurrentRealmManagedUser();
      const ids = await allowedSubjects();
      if (ids?.length) {
        const users = await queryManagedObjects(
          type,
          ids.map((id) => `_id eq ${quote(id)}`).join(' or '),
          FIELDS
        );
        return subjectRows(
          ids.map((id) =>
            toCandidate(
              id,
              users.find((user) => user._id === id)
            )
          )
        );
      }
      const users = await queryManagedObjects(type, 'true', FIELDS);
      return subjectRows(users.map((user) => toCandidate(user._id, user)));
    },

    /** The realm's users that match the text, or a message when there are too many. */
    async search(text: string): Promise<SubjectCandidate[] | string> {
      const type = getCurrentRealmManagedUser();
      const filter = subjectSearchFilter(text);
      const found = await countManagedObjects(type, filter);
      if (found > SUBJECT_MATCH_LIMIT) {
        return `${found} users match '${text}'. Type more of the username, name or email.`;
      }
      const users = await queryManagedObjects(type, filter, FIELDS);
      return subjectRows(users.map((user) => toCandidate(user._id, user)));
    },
  };
}
