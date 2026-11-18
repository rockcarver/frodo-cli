/**
 * The checks behind test/unit/ConfigManagerOptionLetters.test.js: inside the
 * configuration command group a short letter has one meaning, the short forms
 * that the options record decided are the ones the commands declare, a dry run
 * is `-d`, a heritage command does not take a letter of the group for another
 * option unless a reason says why, a description names only letters that its
 * command declares, and MIGRATION.md lists every removed spelling:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md
 * (options of the configuration commands).
 *
 * Everything here is pure: no file system, no state, no output, no commander.
 * The test reads the command tree and MIGRATION.md and passes plain data in.
 * A leaf is `{ name, description, options }` where `name` is the full command
 * (`frodo config-manager pull cors`) and an option has `short`, `long` and
 * `description` (a commander Option has all three).
 */

/**
 * The letters every command gets from FrodoCommand, with the long name each one
 * has on every command. A command that gives one of them another long name is a
 * problem; the shared uses are left out of the letters of a group.
 */
export const SHARED_LETTERS = {
  '-m': '--type',
  '-D': '--directory',
  '-E': '--env',
  '-F': '--force-update',
  '-k': '--insecure',
  '-h': '--help',
};

/**
 * A leaf of the configuration group: pull, push, delete, migrate or promote
 * under `frodo config-manager` or `frodo config` (the group is called
 * config-manager now and config later). The export and import commands of
 * `config` and `frodo promote` are heritage commands.
 * @param {string} name the full command, `frodo config-manager pull cors`
 * @returns {boolean} true for a leaf of the group
 */
export function isGroupLeaf(name) {
  return /^frodo (?:config-manager|config) (?:pull|push|delete|migrate|promote)(?: |$)/.test(
    name
  );
}

/**
 * The letters the leaves declare, and what each one means: letter, then long
 * name, then the commands that declare that pair. A long-only option has no
 * letter, and a shared letter with its shared long name is left out.
 * @param {{name: string, options: {short?: string, long?: string}[]}[]} leaves
 * @returns {Object<string, Object<string, string[]>>} the letters
 */
export function lettersOf(leaves) {
  const letters = {};
  for (const leaf of leaves) {
    for (const option of leaf.options) {
      if (!option.short) continue;
      if (SHARED_LETTERS[option.short] === option.long) continue;
      const longs = (letters[option.short] ??= {});
      (longs[option.long] ??= []).push(leaf.name);
    }
  }
  return letters;
}

const sorted = (values) => [...values].sort();
const same = (a, b) => sorted(a).join('\n') === sorted(b).join('\n');
const commandsText = (commands) =>
  commands.length > 3
    ? `${commands.slice(0, 3).join(', ')} and ${commands.length - 3} more`
    : commands.join(', ');

/** A letter named in a description: `-u`, not `--u`, not a letter inside a word. */
const LETTER_IN_TEXT = /(?<![\w-])(-[A-Za-z])(?![\w-])/g;

/** Is `long` covered by an entry item (a string equals, a RegExp tests)? */
const covers = (item, long) =>
  item instanceof RegExp ? item.test(long) : item === long;

function entryProblems(name, entries, fields) {
  const problems = [];
  for (const entry of entries) {
    for (const field of fields) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        problems.push(
          `${name} ${entry.letter ?? entry.command ?? '?'} :: entry without ${field}`
        );
      }
    }
  }
  return problems;
}

/** One meaning per letter, and the shared letters mean one thing everywhere. */
function checkLetters(groupLeaves, sameMeaning, problems, checked) {
  for (const leaf of groupLeaves) {
    for (const option of leaf.options) {
      const shared = SHARED_LETTERS[option.short];
      if (shared && option.long !== shared) {
        problems.letters.push(
          `${option.short} :: ${leaf.name} :: ${option.short} is ${shared} on every command, here it is ${option.long}`
        );
      }
    }
  }
  const letters = lettersOf(groupLeaves);
  const usedEntries = new Set();
  for (const [letter, longs] of Object.entries(letters)) {
    const names = Object.keys(longs);
    if (names.length < 2) continue;
    const entry = sameMeaning.find(
      (e) => e.letter === letter && same(e.longs ?? [], names)
    );
    if (entry) {
      usedEntries.add(entry);
      continue;
    }
    const meanings = names
      .map((long) => `${long} (${commandsText(longs[long])})`)
      .join(' and ');
    problems.letters.push(
      `${letter} :: ${names.length} meanings: ${meanings} :: give the options one letter each; if they are one meaning under two names, add a SAME_MEANING entry { letter, longs, why, until }`
    );
  }
  checked.sameMeaning = usedEntries.size;
  problems.entries.push(
    ...entryProblems('SAME_MEANING', sameMeaning, ['why', 'until'])
  );
  for (const entry of sameMeaning) {
    if (!usedEntries.has(entry)) {
      problems.entries.push(
        `SAME_MEANING ${entry.letter} :: no letter ${entry.letter} has exactly the long names ${(entry.longs ?? []).join(' and ')} any more (until: ${entry.until}) :: remove the entry`
      );
    }
  }
}

/**
 * Every row of the expected short forms is what the command declares, and no
 * row stands twice. `rows` counts the different rows (command and option),
 * `rowsMatched` those whose command, option and letter the tree has.
 */
function checkShortForms(leaves, expected, problems, checked) {
  const byName = new Map(leaves.map((leaf) => [leaf.name, leaf]));
  const seen = new Set();
  const matched = new Set();
  for (const row of expected) {
    const where = `${row.command} :: ${row.long}`;
    if (seen.has(where)) {
      problems.shortForms.push(
        `${where} :: this row stands twice in the expected short forms: one row for each option`
      );
    }
    seen.add(where);
    const leaf = byName.get(row.command);
    if (!leaf) {
      problems.shortForms.push(`${where} :: the command does not exist`);
      continue;
    }
    const option = leaf.options.find((o) => o.long === row.long);
    if (!option) {
      problems.shortForms.push(`${where} :: the command has no such option`);
    } else if ((option.short ?? null) !== row.short) {
      problems.shortForms.push(
        row.short === null
          ? `${where} :: has the short form ${option.short}, where none is expected (a long form only)`
          : `${where} :: has ${option.short ?? 'no short form'}, expected ${row.short}`
      );
    } else {
      matched.add(where);
    }
  }
  checked.rows = seen.size;
  checked.rowsMatched = matched.size;
}

/** `-d, --dry-run` on every command of the group that has a dry run. */
function checkDryRun(groupLeaves, problems, checked) {
  checked.dryRunLeaves = 0;
  for (const leaf of groupLeaves) {
    const option = leaf.options.find((o) => o.long === '--dry-run');
    if (option) checked.dryRunLeaves += 1;
    if (option && option.short !== '-d') {
      problems.dryRun.push(
        `${leaf.name} :: --dry-run has ${option.short ?? 'no short form'}, expected -d`
      );
    }
  }
}

/** A heritage command takes a letter of the group for another option only with a reason. */
function checkHeritage(
  groupLeaves,
  heritageLeaves,
  overlaps,
  problems,
  checked
) {
  const letters = lettersOf(groupLeaves);
  const used = new Map();
  for (const leaf of heritageLeaves) {
    for (const option of leaf.options) {
      const meanings = letters[option.short];
      if (!meanings || SHARED_LETTERS[option.short]) continue;
      if (Object.keys(meanings).includes(option.long)) continue;
      const entry = overlaps.find(
        (e) =>
          e.letter === option.short &&
          (e.longs ?? []).some((item) => covers(item, option.long))
      );
      if (entry) {
        const item = entry.longs.find((i) => covers(i, option.long));
        used.set(`${entry.letter} ${String(item)}`, true);
        continue;
      }
      const inGroup = Object.entries(meanings)
        .map(([long, commands]) => `${long} (${commandsText(commands)})`)
        .join(' and ');
      problems.heritage.push(
        `${leaf.name} :: ${option.short} ${option.long} :: ${option.short} is ${inGroup} in the group :: take another letter, or add a HERITAGE_OVERLAPS entry { letter, longs, why } that says why a mix-up is harmless`
      );
    }
  }
  checked.heritageOverlaps = used.size;
  problems.entries.push(
    ...entryProblems('HERITAGE_OVERLAPS', overlaps, ['why'])
  );
  for (const entry of overlaps) {
    for (const item of entry.longs ?? []) {
      if (!used.has(`${entry.letter} ${String(item)}`)) {
        problems.entries.push(
          `HERITAGE_OVERLAPS ${entry.letter} ${String(item)} :: no heritage command declares ${entry.letter} with it any more, or the group uses it itself :: remove it from the entry`
        );
      }
    }
  }
}

/** A description names only the letters that its command declares. */
function checkDescriptions(leaves, allowed, problems, checked) {
  const usedAllowed = new Set();
  checked.descriptionLeaves = leaves.length;
  for (const leaf of leaves) {
    const declared = new Set([
      ...Object.keys(SHARED_LETTERS),
      ...leaf.options.map((o) => o.short).filter(Boolean),
    ]);
    const texts = [
      ['the description of the command', leaf.description],
      ...leaf.options.map((o) => [
        `the description of ${o.long ?? o.short}`,
        o.description,
      ]),
    ];
    for (const [what, text] of texts) {
      for (const [, letter] of String(text ?? '').matchAll(LETTER_IN_TEXT)) {
        if (declared.has(letter)) continue;
        const entry = allowed.find(
          (e) => e.command === leaf.name && e.letter === letter
        );
        if (entry) {
          usedAllowed.add(entry);
          continue;
        }
        problems.descriptions.push(
          `${leaf.name} :: ${what} names ${letter}, which the command does not declare :: name the long option instead, or add a DESCRIPTION_LETTERS entry { command, letter, why } for a text that is not an option`
        );
      }
    }
  }
  checked.descriptionLetters = usedAllowed.size;
  problems.entries.push(
    ...entryProblems('DESCRIPTION_LETTERS', allowed, ['why'])
  );
  for (const entry of allowed) {
    if (!usedAllowed.has(entry)) {
      problems.entries.push(
        `DESCRIPTION_LETTERS ${entry.command} ${entry.letter} :: no description names it any more :: remove the entry`
      );
    }
  }
}

/**
 * MIGRATION.md lists every removed spelling on a line of its own, with its
 * command, and announces the dry runs that got `-d` in the paragraph that holds
 * `-d, --dry-run` (a command that is named in another entry does not count).
 */
function checkMigration(text, expected, problems, checked) {
  const lines = text.split('\n');
  const announcements = text
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.includes('`-d, --dry-run`'))
    .map((paragraph) => paragraph.replace(/\s+/g, ' '));
  const commandWords = (command) =>
    command.replace(/^frodo (?:config-manager )?/, '');
  checked.spellings = 0;
  checked.dryRunAdded = 0;
  for (const row of expected) {
    const words = commandWords(row.command);
    if (row.was) {
      const spelling = `\`${row.was}, ${row.long}\``;
      const found = lines.some(
        (line) => line.includes(spelling) && line.includes(`\`${words}\``)
      );
      if (found) checked.spellings += 1;
      else {
        problems.migration.push(
          `${row.command} :: ${row.long} :: MIGRATION.md has no line with ${spelling} and \`${words}\` for the spelling that was removed`
        );
      }
    } else if (row.short === '-d') {
      if (
        announcements.some((paragraph) => paragraph.includes(`\`${words}\``))
      ) {
        checked.dryRunAdded += 1;
      } else {
        problems.migration.push(
          `${row.command} :: --dry-run :: the paragraph of MIGRATION.md that holds \`-d, --dry-run\` does not name \`${words}\`: say that \`-d\` is new on it`
        );
      }
    }
  }
}

/**
 * The inputs of `findLetterProblems`, all of them required: a call that loses
 * one must fail, not run a check on nothing. The lists may be empty (a letter
 * can lose its last `SAME_MEANING` entry), except `expected` and `migration`,
 * which are what the check compares the commands with.
 */
function requireInputs(input) {
  const lists = [
    'groupLeaves',
    'heritageLeaves',
    'sameMeaning',
    'heritageOverlaps',
    'descriptionLetters',
  ];
  for (const name of lists) {
    if (!Array.isArray(input[name])) {
      throw new TypeError(
        `findLetterProblems: the input "${name}" is missing: pass the list (it may be empty)`
      );
    }
  }
  if (!Array.isArray(input.expected) || input.expected.length === 0) {
    throw new TypeError(
      'findLetterProblems: the input "expected" is missing or empty: the rows of the short forms are what the commands are compared with'
    );
  }
  if (typeof input.migration !== 'string' || input.migration.trim() === '') {
    throw new TypeError(
      'findLetterProblems: the input "migration" is missing or empty: pass the text of MIGRATION.md'
    );
  }
}

/**
 * The checks of the option letters. Pure: the caller reads the command tree and
 * MIGRATION.md. Every input is required (see `requireInputs`), and the result
 * says how much each input made the check look at, so that a call that passes
 * a list the check cannot use is noticed (`checked`).
 *
 * - `letters`: one meaning per letter among the leaves of the group, and the
 *   shared letters mean one thing everywhere; a letter that has two long names
 *   needs a `sameMeaning` entry `{ letter, longs, why, until }` (the names are
 *   one meaning, `until` says when the entry goes);
 * - `shortForms`: every row `{ command, long, short, was }` of `expected` is
 *   what the command declares (`short` null: a long form only), and no row
 *   stands twice;
 * - `dryRun`: `--dry-run` has `-d` on every leaf of the group;
 * - `heritage`: a heritage leaf that takes a letter of the group for an option
 *   with another long name needs a `heritageOverlaps` entry `{ letter, longs,
 *   why }` (`longs`: strings and regular expressions);
 * - `descriptions`: a description names only letters its command declares,
 *   unless a `descriptionLetters` entry `{ command, letter, why }` says it is
 *   not an option;
 * - `migration`: the text of MIGRATION.md lists each removed spelling (`was`)
 *   with its command and long name, and names each command that got `-d` in
 *   the paragraph that holds `-d, --dry-run`;
 * - `entries`: every entry has its reasons and is still needed.
 * @param {object} input the data of the checks
 * @param {object[]} input.groupLeaves the leaves of the group
 * @param {object[]} input.heritageLeaves the leaves outside the group (the
 * commands whose definitions the record changes, and the ones it compares with)
 * @param {object[]} input.sameMeaning entries of letters with two long names
 * @param {object[]} input.expected rows of the short forms the record decided
 * @param {object[]} input.heritageOverlaps entries of the heritage letters
 * @param {object[]} input.descriptionLetters entries of letters in a text
 * @param {string} input.migration the text of MIGRATION.md
 * @returns {{problems: Object<string, string[]>, checked: Object<string, number>}}
 * `problems`: one line per problem, by check, all empty when all is well;
 * `checked`: what the check looked at (`groupLeaves`, `heritageLeaves`,
 * `rows` of the expected short forms, `sameMeaning` entries used, `dryRunLeaves`,
 * `heritageOverlaps` names used, `descriptionLeaves` read, `descriptionLetters`
 * entries used, `spellings` found in MIGRATION.md and `dryRunAdded` announced)
 * @throws {TypeError} when an input is missing, or `expected` or `migration`
 * is empty
 */
export function findLetterProblems(input) {
  requireInputs(input);
  const {
    groupLeaves,
    heritageLeaves,
    sameMeaning,
    expected,
    heritageOverlaps,
    descriptionLetters,
    migration,
  } = input;
  const problems = {
    letters: [],
    shortForms: [],
    dryRun: [],
    heritage: [],
    descriptions: [],
    migration: [],
    entries: [],
  };
  const checked = {
    groupLeaves: groupLeaves.length,
    heritageLeaves: heritageLeaves.length,
  };
  checkLetters(groupLeaves, sameMeaning, problems, checked);
  checkShortForms(
    [...groupLeaves, ...heritageLeaves],
    expected,
    problems,
    checked
  );
  checkDryRun(groupLeaves, problems, checked);
  checkHeritage(
    groupLeaves,
    heritageLeaves,
    heritageOverlaps,
    problems,
    checked
  );
  const named = new Set(expected.map((row) => row.command));
  checkDescriptions(
    [...groupLeaves, ...heritageLeaves.filter((leaf) => named.has(leaf.name))],
    descriptionLetters,
    problems,
    checked
  );
  checkMigration(migration, expected, problems, checked);
  return { problems, checked };
}
