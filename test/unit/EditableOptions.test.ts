import { describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import { sortEditableOptions } from '../../src/utils/interactive/EditableOptions';

/**
 * The editor's candidate ORDER (bucketed by help-group category --
 * command-specific first, then connection, then the rest): pins the
 * -h/-hh-consistent split the editor list now makes.
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

  it('command-specific options sort before connection, then the rest', () => {
    const command = makeCommand();
    const sorted = sortEditableOptions(command.options);
    const names = sorted.map((option) => option.name());
    // Within buckets: alphabetical (all < long; deploy; username <
    // color?? no -- bucket 2 is auth/runtime/output alphabetized by
    // option word: color < retry < username).
    expect(names).toEqual([
      'all',
      'long',
      'deploy',
      'color',
      'retry',
      'username',
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
