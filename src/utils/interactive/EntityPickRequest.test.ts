import { describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import { canChooseAfterConnecting, getEntityPicks } from './EntityPickers';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks, requestablePicks } from './EntityPickRegistry';
import { forgetDeferredChoice, noteDeferredChoice } from './OptionRequirements';

// "Choose after connecting": a command whose entity option is an optional
// filter (`journey describe`: without -i it describes every journey) does not
// get its picker by itself, because the command line is complete without it
// (record 0030). The family lists such commands in `onRequest`, and the user
// can ask for the picker on the options page. The pick then runs after login,
// like the picks that open by themselves.

registerEntityPickFamilies();

/** The command `<path...>` with the given options (flags such as `-i, --journey-id <journey>`). */
function commandAt(path: string[], ...flags: string[]): Command {
  const root = new Command('frodo');
  let parent = root;
  for (const name of path.slice(0, -1)) {
    const group = new Command(name);
    parent.addCommand(group);
    parent = group;
  }
  const leaf = new Command(path[path.length - 1]);
  for (const flag of flags) leaf.addOption(new Option(flag));
  parent.addCommand(leaf);
  return leaf;
}

const journeyId = ['-i, --journey-id <journey>'];
const names = (picks: { name: string }[]) => picks.map((pick) => pick.name);

describe('the picks that are available on request', () => {
  it('belong to the commands whose entity option is an optional filter', () => {
    const describeJourney = commandAt(['journey', 'describe'], ...journeyId);
    expect(names(familyEntityPicks(describeJourney))).toEqual([]);
    expect(names(requestablePicks(describeJourney))).toEqual(['journeyId']);

    const describeNode = commandAt(
      ['node', 'describe'],
      '-i, --node-id <node-id>',
      '-n, --node-name <name>'
    );
    expect(names(requestablePicks(describeNode))).toEqual([
      'nodeId',
      'nodeName',
    ]);
    const describeNodeType = commandAt(
      ['node', 'type', 'describe'],
      '-i, --node-id <node-id>'
    );
    expect(names(requestablePicks(describeNodeType))).toEqual(['nodeId']);
  });

  it('are not offered where a picker has nothing to offer or opens by itself', () => {
    // names a journey in a file
    expect(
      requestablePicks(commandAt(['journey', 'import'], ...journeyId))
    ).toEqual([]);
    // names a new proxy
    expect(
      requestablePicks(
        commandAt(['idm', 'remote-proxy', 'setup'], '-i, --proxy-id <id>')
      )
    ).toEqual([]);
    // opens by itself, so there is nothing to ask for
    expect(
      requestablePicks(commandAt(['journey', 'export'], ...journeyId))
    ).toEqual([]);
    // no family
    expect(requestablePicks(commandAt(['conn', 'list'], ...journeyId))).toEqual(
      []
    );
  });

  it('are only for the options the command has', () => {
    expect(requestablePicks(commandAt(['journey', 'describe']))).toEqual([]);
  });
});

describe('canChooseAfterConnecting', () => {
  it('is true for an option whose pick is on request, and for one whose pick opens by itself', () => {
    expect(
      canChooseAfterConnecting(
        commandAt(['journey', 'describe'], ...journeyId),
        'journeyId'
      )
    ).toBe(true);
    expect(
      canChooseAfterConnecting(
        commandAt(['journey', 'export'], ...journeyId),
        'journeyId'
      )
    ).toBe(true);
  });

  it('is false for an option that names no entity of a family, and where a picker has nothing to offer', () => {
    const describeJourney = commandAt(
      ['journey', 'describe'],
      ...journeyId,
      '-f, --file <file>'
    );
    expect(canChooseAfterConnecting(describeJourney, 'file')).toBe(false);
    expect(
      canChooseAfterConnecting(
        commandAt(['journey', 'import'], ...journeyId),
        'journeyId'
      )
    ).toBe(false);
  });
});

describe('the picks that run after login', () => {
  it('do not include a pick on request until the user asked for it', () => {
    const command = commandAt(['journey', 'describe'], ...journeyId);
    expect(names(getEntityPicks(command))).toEqual([]);

    noteDeferredChoice(command, 'journeyId');
    expect(names(getEntityPicks(command))).toEqual(['journeyId']);
  });

  it('forget the request when the user unmarks the option', () => {
    const command = commandAt(['journey', 'describe'], ...journeyId);
    noteDeferredChoice(command, 'journeyId');

    forgetDeferredChoice(command, 'journeyId');

    expect(names(getEntityPicks(command))).toEqual([]);
  });

  it('take no request for an option that has no pick on request', () => {
    const command = commandAt(
      ['journey', 'describe'],
      ...journeyId,
      '-f, --file <file>'
    );
    noteDeferredChoice(command, 'file');
    expect(names(getEntityPicks(command))).toEqual([]);
  });

  it('count a pick that opens by itself once, however often it is asked for', () => {
    const command = commandAt(['journey', 'export'], ...journeyId);
    noteDeferredChoice(command, 'journeyId');
    noteDeferredChoice(command, 'journeyId');
    expect(names(getEntityPicks(command))).toEqual(['journeyId']);
  });
});
