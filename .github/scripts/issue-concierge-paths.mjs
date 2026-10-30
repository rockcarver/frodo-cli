// Where a repository keeps what belongs to the Issue Concierge, and what those places used to be called.
//
// The product is named for its kind, "issue-concierge", because more than one kind of concierge may share a repository
// (docs/decisions/0038). Its names were not always that: the first version called the folder of a repository's own files
// `.github/agentic-workflows`, and the pin file and the variables used the bare word "concierge". A deployment that has
// not been moved yet keeps working: every reader looks in the new place first and in the old one second, and the updater
// moves the files in its next pull request. The old places are read until the next major release.
export const CONFIG_DIR = '.github/issue-concierge';
export const LEGACY_DIR = '.github/agentic-workflows';
export const PIN_PATH = '.github/issue-concierge.yml';
export const LEGACY_PIN_PATH = '.github/concierge.yml';

/** The files a repository may keep in the folder. The updater moves these, and only these. */
export const CONFIG_FILES = ['complexity.md', 'guard.md', 'issue-completeness.md', 'related-repos.md', 'risk.md', 'scope.md', 'settings.yml'];

export const configPath = (name) => `${CONFIG_DIR}/${name}`;
export const legacyPath = (name) => `${LEGACY_DIR}/${name}`;

const found = (value) => value !== null && value !== undefined && value !== false;

/**
 * Reads from the first of `paths` that `read` finds. `read(path)` returns the content, or null/undefined/false when the
 * file is not there. Returns { path, value, legacy }: when nothing is found, `path` is the first (the new) one and `value`
 * is null, so a message can name the place where the file belongs.
 */
export function firstFound(paths, read) {
  for (const path of paths) {
    const value = read(path);
    if (found(value)) return { path, value, legacy: path !== paths[0] };
  }
  return { path: paths[0], value: null, legacy: false };
}

/** A file of the folder, from the new place or else the old one. */
export const readConfig = (name, read) => firstFound([configPath(name), legacyPath(name)], read);

/** The pin file, from the new place or else the old one. */
export const readPin = (read) => firstFound([PIN_PATH, LEGACY_PIN_PATH], read);

/**
 * The same for a source that answers with a status, as the GitHub contents API does: the old place is tried only when the
 * new one is not there (404). A server error or a refusal on the new place is the answer, because a stale file in the old
 * place must not stand in for one that could not be read. `get(path)` returns { status, ... } or null.
 */
export function viaApi(paths, get) {
  const first = get(paths[0]);
  // Only an explicit "not there" falls back. No answer at all is a failed read, and a file in the old place must not stand in for it.
  if (!first || first.status !== 404) return { path: paths[0], result: first, legacy: false };
  for (const path of paths.slice(1)) {
    const next = get(path);
    if (next && next.status === 200) return { path, result: next, legacy: true };
  }
  return { path: paths[0], result: first, legacy: false };
}

/** A file of the folder through such a source. */
export const configViaApi = (name, get) => viaApi([configPath(name), legacyPath(name)], get);

/**
 * What the updater moves: each file of the folder that is in the old place and not in the new one. A file in both places
 * is left alone, because the new one wins and the old one is no longer read; it is reported so that a person can delete it.
 * `exists(path)` says whether a file is there.
 */
export function plannedMoves(exists) {
  const moves = [];
  const both = [];
  for (const name of CONFIG_FILES) {
    if (!exists(legacyPath(name))) continue;
    if (exists(configPath(name))) both.push({ from: legacyPath(name), to: configPath(name) });
    else moves.push({ from: legacyPath(name), to: configPath(name) });
  }
  return { moves, both };
}
