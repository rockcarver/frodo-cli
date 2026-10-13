import { describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  editableOptionGroupOf,
  editableOptionGroups,
  sortEditableOptions,
} from '../../src/utils/interactive/EditableOptions';

/**
 * The editor's candidate ORDER (command-specific first, then the shared
 * groups alphabetically by heading -- the -hh order): pins the split the
 * grouped editor renders, plus the grouping helpers behind it.
 */
describe('sortEditableOptions (bucketed candidate order)', () => {
  function makeCommand(): Command {
    const command = new Command('list');
    // Leaf's own options: no help group heading.
    command.addOption(new Option('-l, --long', 'Long listing'));
    command.addOption(new Option('-a, --all', 'All entries'));
    // Shared machinery with categories (FrodoCommand assigns these via
    // withHelpGroup; the headings are what the buckets key on).
    const connection = new Option('--deploy <type>', 'Deployment');
    connection.helpGroup('Connection Options:');
    const runtime = new Option('--retry <strategy>', 'Retry');
    runtime.helpGroup('Runtime Options:');
    const auth = new Option('--username <user>', 'Username');
    auth.helpGroup('Authentication Options:');
    const output = new Option('--color', 'Color');
    output.helpGroup('Output Options:');
    command.addOption(connection);
    command.addOption(runtime);
    command.addOption(auth);
    command.addOption(output);
    command.action(async () => {});
    return command;
  }

  it('own options first, then the shared groups in -hh order', () => {
    const command = makeCommand();
    const sorted = sortEditableOptions(command.options);
    const names = sorted.map((option) => option.name());
    // Groups alphabetical by heading: Authentication, Connection,
    // Output, Runtime; the dash-insensitive word sort INSIDE each.
    expect(names).toEqual([
      'all',
      'long',
      'username',
      'deploy',
      'color',
      'retry',
    ]);
  });

  it('editableOptionGroupOf: own options undefined, shared options keyed by heading', () => {
    const command = makeCommand();
    const own = command.options.find((option) => option.name() === 'long')!;
    const connection = command.options.find(
      (option) => option.name() === 'deploy'
    )!;
    expect(editableOptionGroupOf(own)).toBeUndefined();
    expect(editableOptionGroupOf(connection)).toBe('Connection Options:');
  });

  it('editableOptionGroups: -hh order, labels, own options produce no group', () => {
    const command = makeCommand();
    const own = command.options.filter(
      (option) => editableOptionGroupOf(option) === undefined
    );
    expect(editableOptionGroups(own)).toEqual([]);
    expect(editableOptionGroups(command.options)).toEqual([
      { id: 'Authentication Options:', label: 'Authentication options' },
      { id: 'Connection Options:', label: 'Connection options' },
      { id: 'Output Options:', label: 'Output options' },
      { id: 'Runtime Options:', label: 'Runtime options' },
    ]);
  });

  it('keeps dash-insensitive word order within a bucket', () => {
    const command = new Command('list');
    command.addOption(new Option('-D, --directory <dir>', 'Dir'));
    command.addOption(new Option('-a, --all', 'All'));
    command.addOption(new Option('-l, --long', 'Long'));
    const sorted = sortEditableOptions(command.options);
    expect(sorted.map((option) => option.name())).toEqual([
      'all',
      'directory',
      'long',
    ]);
  });

  it('does not mutate the input array', () => {
    const command = makeCommand();
    const before = command.options.map((option) => option.name());
    sortEditableOptions(command.options);
    expect(command.options.map((option) => option.name())).toEqual(before);
  });
});
