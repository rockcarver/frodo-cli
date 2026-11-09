import { describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  deferOneOfGroups,
  deferredChoicesOf,
  getOneOfGroups,
  isOptionGiven,
  noteDeferredChoice,
  oneOfMemberAnswering,
} from './OptionRequirements';

function command(): Command {
  const leaf = new Command('delete');
  leaf.addOption(new Option('-i, --node-id <node-id>'));
  leaf.addOption(new Option('-n, --node-name <node-name>'));
  leaf.addOption(new Option('-a, --all'));
  leaf.addOption(new Option('-v, --version <version>'));
  deferOneOfGroups(leaf, [
    { options: ['nodeId', 'nodeName', 'all'], all: false, purpose: 'what' },
  ]);
  deferOneOfGroups(leaf, [
    { options: ['nodeId', 'version'], all: true, purpose: 'which' },
  ]);
  return leaf;
}

describe('the option requirements of a command', () => {
  it('keeps the groups registered on a command, in order', () => {
    const leaf = command();
    expect(getOneOfGroups(leaf).map((group) => group.options)).toEqual([
      ['nodeId', 'nodeName', 'all'],
      ['nodeId', 'version'],
    ]);
    expect(getOneOfGroups(new Command('other'))).toEqual([]);
  });

  it('counts an option as given unless it is unset, false or empty', () => {
    const leaf = command();
    expect(isOptionGiven(leaf, 'all')).toBe(false);
    leaf.setOptionValue('all', false);
    expect(isOptionGiven(leaf, 'all')).toBe(false);
    leaf.setOptionValue('nodeId', '');
    expect(isOptionGiven(leaf, 'nodeId')).toBe(false);
    leaf.setOptionValue('nodeId', 'zion');
    expect(isOptionGiven(leaf, 'nodeId')).toBe(true);
    leaf.setOptionValue('all', true);
    expect(isOptionGiven(leaf, 'all')).toBe(true);
  });

  it('names the member of a one-of group that answers for an option', () => {
    const leaf = command();
    expect(oneOfMemberAnswering(leaf, 'nodeName')).toBeUndefined();
    leaf.setOptionValue('all', true);
    expect(oneOfMemberAnswering(leaf, 'nodeName')).toBe('all');
    expect(oneOfMemberAnswering(leaf, 'nodeId')).toBe('all');
  });

  it('does not let a member answer for itself', () => {
    const leaf = command();
    leaf.setOptionValue('nodeName', 'zion');
    expect(oneOfMemberAnswering(leaf, 'nodeName')).toBeUndefined();
    expect(oneOfMemberAnswering(leaf, 'nodeId')).toBe('nodeName');
  });

  it('does not take the members of a group that needs all of them for an answer', () => {
    const leaf = command();
    leaf.setOptionValue('version', '2');
    expect(oneOfMemberAnswering(leaf, 'nodeId')).toBeUndefined();
  });

  it('counts a member the user chose in the resolution pass, whose value is still to come', () => {
    const leaf = command();
    expect(deferredChoicesOf(leaf).size).toBe(0);
    noteDeferredChoice(leaf, 'nodeName');
    expect(deferredChoicesOf(leaf).has('nodeName')).toBe(true);
    expect(oneOfMemberAnswering(leaf, 'nodeId')).toBe('nodeName');
    expect(oneOfMemberAnswering(leaf, 'nodeName')).toBeUndefined();
    expect(deferredChoicesOf(command()).size).toBe(0);
  });
});
