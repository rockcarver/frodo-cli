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
 * (`frodo config-manager pull cors`) and an option has `short`, `long`,
 * `description` and, for an option that answers to extra spellings, `aliases`
 * (the spellings `-n` and `--name` of `-i, --journey-id`; see
 * src/cli/OptionAlias.ts).
 *
 * The selectors of the group are one meaning per letter: `-i, --<type>-id`
 * names an object by its identifier and `-n, --<type>-name` by a name that can
 * change, whatever the type is, and `-n, --name` is the permanent alias
 * (`selectorMeaning`, the `selectorLetters` input).
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
 * The short letter that a spelling is, or null for a long spelling.
 * @param {string} spelling `-n` or `--name`
 * @returns {string|null} the letter
 */
const letterOfSpelling = (spelling) =>
  /^-[A-Za-z]$/.test(spelling) ? spelling : null;

/**
 * The letters an option answers to, each with the long name it means: its own
 * short form with its long name, and the letters of its alias spellings. An
 * alias letter means the alias long name when the option has one (`-n` with
 * `--name`), otherwise the long name of the option.
 * @param {{short?: string, long?: string, aliases?: string[]}} option
 * @returns {[string, string][]} pairs of letter and long name
 */
function letterMeanings(option) {
  const pairs = [];
  if (option.short) pairs.push([option.short, option.long]);
  const aliases = option.aliases ?? [];
  const aliasLong = aliases.find((a) => a.startsWith('--')) ?? option.long;
  for (const spelling of aliases) {
    const letter = letterOfSpelling(spelling);
    if (letter) pairs.push([letter, aliasLong]);
  }
  return pairs;
}

/**
 * The letters the leaves declare, and what each one means: letter, then long
 * name, then the commands that declare that pair. A long-only option has no
 * letter, and a shared letter with its shared long name is left out. The
 * letters of an alias count (`-n` of `-i, --journey-id` with the alias `-n,
 * --name` means `--name`).
 * @param {{name: string, options: {short?: string, long?: string, aliases?: string[]}[]}[]} leaves
 * @returns {Object<string, Object<string, string[]>>} the letters
 */
export function lettersOf(leaves) {
  const letters = {};
  for (const leaf of leaves) {
    for (const option of leaf.options) {
      for (const [letter, long] of letterMeanings(option)) {
        if (SHARED_LETTERS[letter] === long) continue;
        const longs = (letters[letter] ??= {});
        const commands = (longs[long] ??= []);
        if (!commands.includes(leaf.name)) commands.push(leaf.name);
      }
    }
  }
  return letters;
}

/**
 * Do a letter and a long name mean the selector of the group? `-i` with
 * `--id`, `--report-id` or `--<type>-id` names an object by its identifier;
 * `-n` with `--name` or `--<type>-name` names an object by a name. A
 * `selectorLetters` entry is `{ letter, pattern, why }`.
 * @param {string} letter `-i`
 * @param {string} long `--journey-id`
 * @param {{letter: string, pattern: RegExp}[]} selectorLetters
 * @returns {boolean} true when the pair is the selector of its letter
 */
export function selectorMeaning(letter, long, selectorLetters) {
  return selectorLetters.some(
    (entry) => entry.letter === letter && entry.pattern.test(long ?? '')
  );
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

/** The one meaning that every selector long name of a letter counts as. */
const SELECTOR = '<selector>';

/** One meaning per letter, and the shared letters mean one thing everywhere. */
function checkLetters(
  groupLeaves,
  sameMeaning,
  selectorLetters,
  problems,
  checked
) {
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
  const usedSelectors = new Set();
  for (const [letter, longs] of Object.entries(letters)) {
    // the selector long names of a letter are one meaning
    const selectorLongs = Object.keys(longs).filter((long) =>
      selectorMeaning(letter, long, selectorLetters)
    );
    if (selectorLongs.length > 1) {
      for (const entry of selectorLetters) {
        if (entry.letter === letter) usedSelectors.add(entry);
      }
    }
    const names = [
      ...Object.keys(longs).filter((long) => !selectorLongs.includes(long)),
      ...(selectorLongs.length > 0 ? [SELECTOR] : []),
    ];
    if (names.length < 2) continue;
    const entry = sameMeaning.find(
      (e) => e.letter === letter && same(e.longs ?? [], names)
    );
    if (entry) {
      usedEntries.add(entry);
      continue;
    }
    const meanings = names
      .map((name) => {
        const commands =
          name === SELECTOR
            ? selectorLongs.flatMap((long) => longs[long])
            : longs[name];
        const label = name === SELECTOR ? `${selectorLongs.join('/')}` : name;
        return `${label} (${commandsText(commands)})`;
      })
      .join(' and ');
    problems.letters.push(
      `${letter} :: ${names.length} meanings: ${meanings} :: give the options one letter each; if they are one meaning under two names, add a SAME_MEANING entry { letter, longs, why, until }`
    );
  }
  checked.sameMeaning = usedEntries.size;
  checked.selectorLetters = usedSelectors.size;
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
  problems.entries.push(
    ...entryProblems('SELECTOR_LETTERS', selectorLetters, ['why'])
  );
  for (const entry of selectorLetters) {
    if (!(entry.pattern instanceof RegExp)) {
      problems.entries.push(
        `SELECTOR_LETTERS ${entry.letter ?? '?'} :: entry without a pattern`
      );
    } else if (!usedSelectors.has(entry)) {
      problems.entries.push(
        `SELECTOR_LETTERS ${entry.letter} :: no letter ${entry.letter} has two long names that ${entry.pattern} joins any more :: remove the entry`
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
      ...leaf.options.flatMap((o) => letterMeanings(o).map(([l]) => l)),
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
    'selectorLetters',
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
 *   one meaning, `until` says when the entry goes), unless the names are the
 *   selector of the letter: a `selectorLetters` entry `{ letter, pattern, why }`
 *   makes every long name that the pattern matches one meaning (`-i` with
 *   `--<type>-id`, `-n` with `--<type>-name`), and the entry fails when no letter
 *   has two such names;
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
 * @param {object[]} input.selectorLetters entries of the selector letters
 * @param {object[]} input.expected rows of the short forms the record decided
 * @param {object[]} input.heritageOverlaps entries of the heritage letters
 * @param {object[]} input.descriptionLetters entries of letters in a text
 * @param {string} input.migration the text of MIGRATION.md
 * @returns {{problems: Object<string, string[]>, checked: Object<string, number>}}
 * `problems`: one line per problem, by check, all empty when all is well;
 * `checked`: what the check looked at (`groupLeaves`, `heritageLeaves`,
 * `rows` of the expected short forms, `sameMeaning` entries used,
 * `selectorLetters` entries used, `dryRunLeaves`,
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
    selectorLetters,
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
  checkLetters(groupLeaves, sameMeaning, selectorLetters, problems, checked);
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

/**
 * The selectors of the group: every object-selecting command of `pull`,
 * `push` and `delete` names an object by `-i, --<type>-id` and, for a type with
 * a name that can change, by `-n, --<type>-name`, mutually exclusive, and
 * keeps `-n, --name` as a permanent alias
 * (https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0057-options-of-the-configuration-commands.md,
 * options of the configuration commands). Everything below is pure, like the
 * checks above: the test reads the command tree and passes plain data in.
 *
 * A selector row is `{ command, id, name, aliases }`: the full command, the
 * long form of `-i`, the long form of `-n` (null when `-n` is only an alias of
 * `-i`), and the spellings that the option with the alias answers to (`['-n',
 * '--name']` on `-i`, `['--name']` on `-n`, none for a command that has no
 * `--name` today). A leaf of the tree is `{ name, options, oneOf }`; an option
 * has `short`, `long`, `description`, `aliases`, `mandatory`, `takesValue`,
 * `attribute` and `conflicts` (attribute names), and `oneOf` lists the
 * attribute names that stand in a one-of group.
 */

const ID_LONG = /^--(?:[a-z]+-)*id$/;
const NAME_LONG = /^--(?:[a-z]+-)*name$/;

/** The words of a command after `frodo config-manager` or `frodo config`. */
const commandWords = (command) =>
  command.replace(/^frodo (?:config-manager|config) /, '');

/** The verb of a command of the group: `pull`, `push`, `delete`, `migrate` or `promote`. */
const verbOf = (command) => commandWords(command).split(' ')[0];

/** Is a spelling a short flag (`-n`) or a long flag (`--name`)? */
const isSpelling = (spelling) =>
  /^(?:-[A-Za-z]|--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/.test(spelling);

/**
 * What is wrong with one row of the expected selectors, apart from the tree.
 * @param {{command: string, id: string, name: string|null, aliases: string[]}} row
 * @returns {string[]} the problems
 */
function rowProblems(row) {
  const where = `${row.command} :: row`;
  const problems = [];
  if (!ID_LONG.test(row.id ?? '')) {
    problems.push(
      `${where} :: the id option ${row.id} is not --<type>-id: name the type`
    );
  }
  if (row.name !== null && !NAME_LONG.test(row.name ?? '')) {
    problems.push(
      `${where} :: the name option ${row.name} is not --<type>-name: name the type, or null`
    );
  }
  const aliases = row.aliases ?? [];
  const bad = aliases.filter((alias) => !isSpelling(alias));
  if (bad.length > 0) {
    problems.push(
      `${where} :: the alias ${bad.join(', ')} is not a flag: write -x or --long-name`
    );
  }
  if (aliases.includes('-n') && !aliases.includes('--name')) {
    problems.push(
      `${where} :: the alias -n is only the alias of --name: an alias that has the letter has --name too`
    );
  }
  if (
    aliases.length > 0 &&
    !aliases.every((a) => ['-n', '--name'].includes(a))
  ) {
    problems.push(
      `${where} :: the alias ${aliases.join(', ')} is not -n or --name: -n, --name is the one permanent alias`
    );
  }
  if (row.name !== null && aliases.includes('-n')) {
    problems.push(
      `${where} :: the command has -n, ${row.name} of its own, so -n is no alias: the alias of a name is --name`
    );
  }
  return problems;
}

/** The options of a leaf that carry a letter of a selector, by their own short form. */
const optionsWith = (leaf, letter) =>
  leaf.options.filter((option) => option.short === letter);

/** What is wrong with the options of one leaf that a row names. */
function leafProblems(leaf, row, problems, checked) {
  const where = row.command;
  const [id] = optionsWith(leaf, '-i');
  const [name] = optionsWith(leaf, '-n');
  const oneOf = new Set(leaf.oneOf ?? []);
  if (!id) {
    problems.push(`${where} :: has no -i option, expected -i, ${row.id}`);
  } else {
    if (id.long !== row.id) {
      problems.push(`${where} :: -i is ${id.long}, expected ${row.id}`);
    }
    if (!id.takesValue) {
      problems.push(`${where} :: ${id.long} takes no value`);
    }
  }
  if (row.name === null && name) {
    problems.push(
      `${where} :: has -n, ${name.long} of its own, where -n is only an alias of -i (a type with a name that can change takes -n, --<type>-name in its row)`
    );
  }
  if (row.name !== null) {
    if (!name) {
      problems.push(`${where} :: has no -n option, expected -n, ${row.name}`);
    } else {
      if (name.long !== row.name) {
        problems.push(`${where} :: -n is ${name.long}, expected ${row.name}`);
      }
      if (!name.takesValue) {
        problems.push(`${where} :: ${name.long} takes no value`);
      }
    }
  }
  for (const option of [id, name]) {
    if (!option) continue;
    if (option.mandatory) {
      problems.push(
        `${where} :: ${option.long} is mandatory: a selector is a filter, the command works without it`
      );
    }
    if (
      oneOf.has(option.attribute) ||
      oneOf.has((option.long ?? '').replace(/^--/, ''))
    ) {
      problems.push(
        `${where} :: ${option.long} is in a one-of group: a selector is a filter, the command works without it`
      );
    }
  }
  if (id && name) {
    if (!(id.conflicts ?? []).includes(name.attribute)) {
      problems.push(
        `${where} :: ${id.long} does not declare the conflict with ${name.long} (.conflicts(['${name.attribute}']))`
      );
    }
    if (!(name.conflicts ?? []).includes(id.attribute)) {
      problems.push(
        `${where} :: ${name.long} does not declare the conflict with ${id.long} (.conflicts(['${id.attribute}']))`
      );
    }
  }
  // the option that carries the alias: -n on a command with a name, else -i
  const carrier = row.name !== null ? name : id;
  const aliases = row.aliases ?? [];
  if (carrier) {
    const actual = carrier.aliases ?? [];
    if (actual.join(' ') !== aliases.join(' ')) {
      problems.push(
        `${where} :: ${carrier.long} has the alias [${actual.join(', ')}], expected [${aliases.join(', ')}]`
      );
    } else if (aliases.length > 0) {
      const note = `(alias: ${aliases.join(', ')})`;
      if (!String(carrier.description ?? '').endsWith(note)) {
        problems.push(
          `${where} :: the description of ${carrier.long} does not end with ${note}`
        );
      }
    }
  }
  const stray = leaf.options.filter(
    (option) => option.long === '--name' && option !== carrier
  );
  if (stray.length > 0) {
    problems.push(
      `${where} :: has a plain --name option: it is the alias of ${carrier?.long ?? 'the selector'}, not an option of its own`
    );
  }
  if (id && name) checked.pairs += 1;
  if (aliases.length > 0 && carrier) checked.aliased += 1;
}

/**
 * The checks of the selectors:
 *
 * - `rows`: every row `{ command, id, name, aliases }` of `expected` is what
 *   the command declares (see above), the row itself is well formed, and no
 *   command stands twice;
 * - `strays`: a leaf of the group that declares `-i` or `-n` (or an alias with
 *   that letter) and that no row names fails, unless it is in `strays`
 *   (`{ command, long, why }`: an option that selects something else, such as a
 *   promotion), or its verb is in `pendingVerbs` (`{ verb, why }`: the steps of
 *   the program that have not reached that verb yet);
 * - `entries`: every entry has its reason and is still needed.
 * @param {object} input the data of the checks
 * @param {object[]} input.groupLeaves the leaves of the group
 * @param {object[]} input.rows the expected selectors
 * @param {object[]} input.strays options that use `-i` or `-n` for something else
 * @param {object[]} input.pendingVerbs verbs whose commands are not renamed yet
 * @returns {{problems: Object<string, string[]>, checked: Object<string, number>}}
 * `checked`: `rows`, `rowsMatched` (the command exists and has the options),
 * `pairs` (commands with `-i` and `-n`), `aliased` (commands with an alias),
 * `strays` and `pendingVerbs` entries used
 * @throws {TypeError} when an input is missing, or `rows` is empty
 */
export function findSelectorProblems(input) {
  for (const name of ['groupLeaves', 'rows', 'strays', 'pendingVerbs']) {
    if (!Array.isArray(input[name])) {
      throw new TypeError(
        `findSelectorProblems: the input "${name}" is missing: pass the list (it may be empty, except "rows")`
      );
    }
  }
  if (input.rows.length === 0) {
    throw new TypeError(
      'findSelectorProblems: the input "rows" is empty: the rows are what the commands are compared with'
    );
  }
  const { groupLeaves, rows, strays, pendingVerbs } = input;
  const problems = { rows: [], strays: [], entries: [] };
  const checked = {
    rows: 0,
    rowsMatched: 0,
    pairs: 0,
    aliased: 0,
    strays: 0,
    pendingVerbs: 0,
  };
  const byName = new Map(groupLeaves.map((leaf) => [leaf.name, leaf]));
  const named = new Set();
  const matched = new Set();
  for (const row of rows) {
    if (named.has(row.command)) {
      problems.rows.push(
        `${row.command} :: this row stands twice in the expected selectors: one row for each command`
      );
      continue;
    }
    named.add(row.command);
    checked.rows += 1;
    const before = problems.rows.length;
    problems.rows.push(...rowProblems(row));
    const leaf = byName.get(row.command);
    if (!leaf) {
      problems.rows.push(`${row.command} :: the command does not exist`);
      continue;
    }
    leafProblems(leaf, row, problems.rows, checked);
    if (problems.rows.length === before) matched.add(row.command);
  }
  checked.rowsMatched = matched.size;

  const usedStrays = new Set();
  const usedPending = new Set();
  for (const leaf of groupLeaves) {
    if (named.has(leaf.name)) continue;
    const uses = leaf.options.flatMap((option) => [
      ...(option.short === '-i' || option.short === '-n'
        ? [{ letter: option.short, long: option.long }]
        : []),
      ...(option.aliases ?? [])
        .filter((alias) => alias === '-i' || alias === '-n')
        .map((alias) => ({ letter: alias, long: option.long })),
    ]);
    for (const { letter, long } of uses) {
      const entry = strays.find(
        (e) => e.command === leaf.name && e.long === long
      );
      if (entry) {
        usedStrays.add(entry);
        continue;
      }
      const pending = pendingVerbs.find((e) => e.verb === verbOf(leaf.name));
      if (pending) {
        usedPending.add(pending);
        continue;
      }
      problems.strays.push(
        `${leaf.name} :: ${letter} ${long} :: no row of the expected selectors names this command: add a row, or an entry of the strays with the reason why ${letter} selects something else`
      );
    }
  }
  checked.strays = usedStrays.size;
  checked.pendingVerbs = usedPending.size;
  const entryText = (name, entries, fields) =>
    entries.flatMap((entry) =>
      fields
        .filter(
          (field) => typeof entry[field] !== 'string' || !entry[field].trim()
        )
        .map(
          (field) =>
            `${name} ${entry.command ?? entry.verb ?? '?'} :: entry without ${field}`
        )
    );
  problems.entries.push(
    ...entryText('STRAY_SELECTOR_OPTIONS', strays, ['command', 'long', 'why']),
    ...entryText('PENDING_VERBS', pendingVerbs, ['verb', 'why', 'until'])
  );
  for (const entry of strays) {
    if (!usedStrays.has(entry)) {
      problems.entries.push(
        `STRAY_SELECTOR_OPTIONS ${entry.command} ${entry.long} :: the command has no -i or -n option with that long name any more, or a row names it :: remove the entry`
      );
    }
  }
  for (const entry of pendingVerbs) {
    if (!usedPending.has(entry)) {
      problems.entries.push(
        `PENDING_VERBS ${entry.verb} :: every command of the verb that has -i or -n has a row now (until: ${entry.until}) :: remove the entry`
      );
    }
  }
  return { problems, checked };
}

/**
 * MIGRATION.md lists every command of the rows with its new option: a line
 * that holds the command in backticks, the id option as `-i, --<type>-id`, the
 * name option as `-n, --<type>-name` when the command has one, and each alias
 * spelling in backticks.
 * @param {string} text the text of MIGRATION.md
 * @param {object[]} rows the expected selectors
 * @returns {{problems: string[], checked: {rows: number}}}
 */
export function findSelectorMigrationProblems(text, rows) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new TypeError(
      'findSelectorMigrationProblems: the text of MIGRATION.md is missing or empty'
    );
  }
  const lines = text.split('\n');
  const problems = [];
  let found = 0;
  for (const row of rows) {
    const words = commandWords(row.command);
    const wanted = [
      `\`${words}\``,
      `\`-i, ${row.id}\``,
      ...(row.name !== null ? [`\`-n, ${row.name}\``] : []),
      ...(row.aliases ?? []).map((alias) => `\`${alias}\``),
    ];
    const line = lines.find(
      (candidate) =>
        candidate.includes(`\`${words}\``) &&
        candidate.includes(`\`-i, ${row.id}\``)
    );
    if (!line) {
      problems.push(
        `${row.command} :: MIGRATION.md has no line with \`${words}\` and \`-i, ${row.id}\`: add the command to the table of the selectors`
      );
      continue;
    }
    const missing = wanted.filter((item) => !line.includes(item));
    if (missing.length > 0) {
      problems.push(
        `${row.command} :: the line of MIGRATION.md does not hold ${missing.join(', ')}`
      );
      continue;
    }
    found += 1;
  }
  return { problems, checked: { rows: found } };
}

/**
 * The e2e tests type the new spelling of a selector: a `const CMD` line of a
 * command of the rows that has `-n` as an alias (no option of its own) does not
 * type `-n`, `--name` or a cluster that ends in `n`, unless it is listed in
 * `kept` (`{ file, cmd, why }`), which keeps the alias covered end to end. A
 * kept line must still exist.
 * @param {{name: string, text: string}[]} files the e2e test files
 * @param {object[]} rows the expected selectors
 * @param {object[]} kept the lines that keep the old spelling on purpose
 * @returns {{problems: string[], checked: Object<string, number>}}
 */
export function findOldSpellingProblems(files, rows, kept) {
  const problems = [];
  const checked = { cmdLines: 0, kept: 0 };
  const aliased = new Map(
    rows
      .filter((row) => row.name === null)
      .map((row) => [commandWords(row.command), row])
  );
  const used = new Set();
  for (const file of files) {
    for (const line of file.text.split('\n')) {
      const match = /\bCMD\s*=\s*[`'"](.*)[`'"];?\s*$/.exec(line);
      if (!match) continue;
      const cmd = match[1];
      const words =
        /^frodo (?:config-manager|config) ([a-z-]+ [a-z0-9-]+)(?: |$)/.exec(
          cmd
        );
      if (!words || !aliased.has(words[1])) continue;
      checked.cmdLines += 1;
      const args = cmd
        .slice(cmd.indexOf(words[1]) + words[1].length)
        .split(' ');
      const old = args.find(
        (arg) => arg === '-n' || arg === '--name' || /^-[A-Za-z]*n$/.test(arg)
      );
      if (!old) continue;
      const entry = kept.find((e) => e.file === file.name && e.cmd === cmd);
      if (entry) {
        used.add(entry);
        continue;
      }
      problems.push(
        `${file.name} :: ${cmd} :: types ${old}, the alias of ${aliased.get(words[1]).id}: type the new spelling, or list the line as kept on purpose`
      );
    }
  }
  checked.kept = used.size;
  for (const entry of kept) {
    for (const field of ['file', 'cmd', 'why']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) {
        problems.push(
          `KEPT_OLD_SPELLING ${entry.file ?? '?'} :: entry without ${field}`
        );
      }
    }
    if (!used.has(entry)) {
      problems.push(
        `KEPT_OLD_SPELLING ${entry.file} :: ${entry.cmd} :: no such line types the old spelling any more :: remove the entry`
      );
    }
  }
  return { problems, checked };
}
