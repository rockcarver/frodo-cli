import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadCommandTree } from '../utils/CommandExamples.js';

/**
 * Every `config-manager delete` command that can delete more than the one
 * object it names asks first (cli record 0037): -y/--yes and -d/--dry-run, a
 * refusal before the login without a terminal, a question after it. The guard
 * itself is checked through the real CLI by
 * test/client_cli/en/config-manager-delete-guard.test.js; this file checks
 * that no delete command escapes it. A new command that deletes in bulk fails
 * here until it has the guard and its cases in that file.
 *
 * A command that can only ever delete the one object it names is listed in
 * SINGLE_OBJECT_ONLY with the reason. The list is empty on purpose: every
 * command today can delete everything of its kind when no name is given.
 */
const SINGLE_OBJECT_ONLY = {};

/** Subcommands of `config-manager delete` that delete nothing. */
const DELETES_NOTHING = ['test'];

const commandDirectory = new URL(
  '../../src/cli/config-manager/config-manager-delete/',
  import.meta.url
);
const guardTestSource = fs.readFileSync(
  fileURLToPath(
    new URL(
      '../client_cli/en/config-manager-delete-guard.test.js',
      import.meta.url
    )
  ),
  'utf8'
);
/** The cases of "a delete of more than one object ... is refused", the first block of the guard test (its list entries end with a comma). */
const refusedBlock = guardTestSource.slice(
  guardTestSource.indexOf("describe('a delete of more than one object"),
  guardTestSource.indexOf("describe('what is not refused'")
);

let deleteCommands;

beforeAll(async () => {
  const { groups } = await loadCommandTree();
  const group = groups.find((command) => command.name() === 'config-manager');
  const deleteGroup = group?.commands.find(
    (command) => command.name() === 'delete'
  );
  deleteCommands = (deleteGroup?.commands ?? []).filter(
    (command) => command.name() !== 'help'
  );
});

const optionFlags = (command) => command.options.map((option) => option.long);

describe('the config-manager delete commands and the bulk-delete guard', () => {
  test('1: the command tree has the delete commands, so the checks below have something to check', () => {
    const names = deleteCommands.map((command) => command.name());
    expect(names).toEqual(
      expect.arrayContaining([
        'applications',
        'oauth-cimd-profiles',
        'custom-nodes',
        'email-templates',
        'endpoints',
        'locales',
        'scripts',
        'secrets',
        'terms-and-conditions',
        'themes',
        'oauth-issuers',
        'schedules',
        'variables',
      ])
    );
  });

  test('2: every command either has the guard or is listed as single-object-only, with a reason', () => {
    const unguarded = deleteCommands
      .filter((command) => !DELETES_NOTHING.includes(command.name()))
      .filter((command) => !(command.name() in SINGLE_OBJECT_ONLY))
      .filter(
        (command) =>
          !optionFlags(command).includes('--yes') ||
          !optionFlags(command).includes('--dry-run')
      )
      .map((command) => command.name());
    expect(unguarded).toEqual([]);

    for (const [name, reason] of Object.entries(SINGLE_OBJECT_ONLY)) {
      expect({ name, reason }).toEqual({
        name,
        reason: expect.stringMatching(/\S{20,}/),
      });
    }
  });

  test('3: a command listed as single-object-only exists, and has no --yes (otherwise it is not)', () => {
    for (const name of Object.keys(SINGLE_OBJECT_ONLY)) {
      const command = deleteCommands.find((entry) => entry.name() === name);
      expect(command).toBeDefined();
      expect(optionFlags(command)).not.toContain('--yes');
    }
  });

  test('4: every guarded command asks through the shared helpers: checkBulkDelete before the login, confirmBulkDelete after it', () => {
    const guarded = deleteCommands
      .filter((command) => !DELETES_NOTHING.includes(command.name()))
      .filter((command) => !(command.name() in SINGLE_OBJECT_ONLY));
    expect(guarded.length).toBeGreaterThan(0);
    for (const command of guarded) {
      const file = new URL(
        `config-manager-delete-${command.name()}.ts`,
        commandDirectory
      );
      expect({ command: command.name(), exists: fs.existsSync(file) }).toEqual({
        command: command.name(),
        exists: true,
      });
      const source = fs.readFileSync(fileURLToPath(file), 'utf8');
      const check = source.indexOf('checkBulkDelete(');
      const login = source.indexOf('getTokens(');
      const confirm = source.indexOf('confirmBulkDelete(');
      expect({ command: command.name(), check: check >= 0 }).toEqual({
        command: command.name(),
        check: true,
      });
      expect({ command: command.name(), confirm: confirm >= 0 }).toEqual({
        command: command.name(),
        confirm: true,
      });
      // the refusal comes before the login, the question after it
      expect({ command: command.name(), order: check < login }).toEqual({
        command: command.name(),
        order: true,
      });
      expect({ command: command.name(), order: login < confirm }).toEqual({
        command: command.name(),
        order: true,
      });
    }
  });

  test('5: every guarded command has its cases in the guard test: refused, and not refused with -y and with -d', () => {
    const guarded = deleteCommands
      .filter((command) => !DELETES_NOTHING.includes(command.name()))
      .filter((command) => !(command.name() in SINGLE_OBJECT_ONLY));
    for (const command of guarded) {
      const name = command.name();
      const line = (suffix) =>
        new RegExp(`'frodo config-manager delete ${name}( [^']*)?${suffix}'`);
      expect({
        name,
        refused: new RegExp(
          `^\\s*'frodo config-manager delete ${name}( [^']*)?',$`,
          'm'
        ).test(refusedBlock),
      }).toEqual({ name, refused: true });
      expect({ name, yes: line(' -y').test(guardTestSource) }).toEqual({
        name,
        yes: true,
      });
      // the case of the preview: -d where the command has the short form, otherwise --dry-run
      expect({
        name,
        dryRun: line(' (-d|--dry-run)').test(guardTestSource),
      }).toEqual({
        name,
        dryRun: true,
      });
    }
  });
});
