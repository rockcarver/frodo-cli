import { afterEach, describe, expect, it } from '@jest/globals';
import { Command, Option } from 'commander';
import {
  deferEntityPicks,
  entityPick,
  getEntityPicks,
  hasEntityPick,
  resolveFamilyEntityPicks,
} from './EntityPickers';
import {
  commandPathOf,
  familyEntityPicks,
  registerEntityPickFamily,
} from './EntityPickRegistry';

// Decision record 0038: a family of commands registers its entity picks once;
// the commands of the family that have the option inherit them. What matters
// here is which commands inherit, because a wrong match either leaves a
// command without its picker or opens one for a command that names a new
// entity.
type Entity = { _id: string };

const never = () => {
  throw new Error('loader must not be called outside the prompt gate');
};

function proxyPick(name = 'proxyId') {
  return entityPick<Entity>({
    name,
    kind: 'thing',
    load: never,
    label: (entity) => entity._id,
  });
}

/** The command `<path...>` under a root `frodo`, with the given long options. */
function commandAt(path: string[], options: string[] = ['--proxy-id <id>']) {
  const root = new Command('frodo');
  let parent = root;
  for (const name of path.slice(0, -1)) {
    const group = new Command(name);
    parent.addCommand(group);
    parent = group;
  }
  const leaf = new Command(path[path.length - 1]);
  for (const flags of options) leaf.addOption(new Option(flags));
  parent.addCommand(leaf);
  return leaf;
}

let counter = 0;
/** A family name no other test uses: the registry is shared by the whole file. */
function newFamily(): { family: string; group: string[] } {
  const group = ['zone', `family-${counter++}`];
  return { family: group.join(' '), group };
}

afterEach(() => {
  delete process.env.FRODO_TEST;
  delete process.env.FRODO_NO_PROMPT;
});

describe('commandPathOf', () => {
  it('is the names of the command and its parents, without the program name', () => {
    expect(commandPathOf(commandAt(['idm', 'remote-proxy', 'describe']))).toBe(
      'idm remote-proxy describe'
    );
  });
});

describe('familyEntityPicks', () => {
  it('gives a command of the family the pick of an option it has', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick()] });
    const picks = familyEntityPicks(commandAt([...group, 'describe']));
    expect(picks.map((pick) => pick.name)).toEqual(['proxyId']);
  });

  it('gives it to every command of the family that has the option', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick()] });
    for (const verb of ['describe', 'delete', 'export', 'update']) {
      expect(familyEntityPicks(commandAt([...group, verb]))).toHaveLength(1);
    }
  });

  it('gives nothing to a command without the option', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick()] });
    expect(
      familyEntityPicks(commandAt([...group, 'list'], ['--json']))
    ).toEqual([]);
  });

  it('gives only the picks whose option the command has', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({
      family,
      picks: [proxyPick('proxyId'), proxyPick('clientId')],
    });
    const picks = familyEntityPicks(
      commandAt([...group, 'describe'], ['--client-id <id>'])
    );
    expect(picks.map((pick) => pick.name)).toEqual(['clientId']);
  });

  it('gives nothing to create and import: they name a new entity or one in a file', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick()] });
    expect(familyEntityPicks(commandAt([...group, 'create']))).toEqual([]);
    expect(familyEntityPicks(commandAt([...group, 'import']))).toEqual([]);
    expect(familyEntityPicks(commandAt([...group, 'describe']))).toHaveLength(
      1
    );
  });

  it('judges the verb, the last word of the command, for a command below the family', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick()] });
    expect(
      familyEntityPicks(commandAt([...group, 'version', 'create']))
    ).toEqual([]);
    expect(
      familyEntityPicks(commandAt([...group, 'version', 'activate']))
    ).toHaveLength(1);
  });

  it('gives a create the picks when the family lists it in include: its option names an existing entity', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({
      family,
      include: ['version create'],
      picks: [proxyPick()],
    });
    expect(
      familyEntityPicks(commandAt([...group, 'version', 'create']))
    ).toHaveLength(1);
    expect(familyEntityPicks(commandAt([...group, 'create']))).toEqual([]);
  });

  it('gives nothing to the commands named in except', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({
      family,
      except: ['login'],
      picks: [proxyPick()],
    });
    expect(familyEntityPicks(commandAt([...group, 'login']))).toEqual([]);
    expect(familyEntityPicks(commandAt([...group, 'describe']))).toHaveLength(
      1
    );
  });

  it('does not match a family whose name only starts the same way', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick()] });
    const [zone, name] = group;
    expect(
      familyEntityPicks(commandAt([zone, `${name}-other`, 'describe']))
    ).toEqual([]);
  });

  it('gives nothing to the family command itself', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick()] });
    expect(familyEntityPicks(commandAt(group))).toEqual([]);
  });

  it('gives nothing to a command of another family', () => {
    const { family } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick()] });
    expect(
      familyEntityPicks(commandAt(['zone', 'unrelated', 'describe']))
    ).toEqual([]);
  });

  it('keeps the entries of a family apart when they have names: an exception of one does not reach the other', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({
      family,
      except: ['setup'],
      picks: [proxyPick('proxyId')],
    });
    registerEntityPickFamily({
      family,
      name: `${family} targets`,
      picks: [proxyPick('target')],
    });
    const setup = commandAt(
      [...group, 'setup'],
      ['--proxy-id <id>', '--target <host>']
    );
    expect(familyEntityPicks(setup).map((pick) => pick.name)).toEqual([
      'target',
    ]);
    const describe = commandAt(
      [...group, 'describe'],
      ['--proxy-id <id>', '--target <host>']
    );
    expect(
      familyEntityPicks(describe)
        .map((pick) => pick.name)
        .sort()
    ).toEqual(['proxyId', 'target']);
  });

  it('replaces the entry when a family is registered again', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick('proxyId')] });
    registerEntityPickFamily({ family, picks: [proxyPick('clientId')] });
    expect(
      familyEntityPicks(
        commandAt(
          [...group, 'describe'],
          ['--proxy-id <id>', '--client-id <id>']
        )
      ).map((pick) => pick.name)
    ).toEqual(['clientId']);
  });
});

describe('the picks of a command', () => {
  it('are its own and those of its family', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick('proxyId')] });
    const command = commandAt(
      [...group, 'describe'],
      ['--proxy-id <id>', '--client-id <id>']
    );
    deferEntityPicks(command, [proxyPick('clientId')]);
    expect(
      getEntityPicks(command)
        .map((pick) => pick.name)
        .sort()
    ).toEqual(['clientId', 'proxyId']);
  });

  it('keep the command’s own pick for an option the family also has, once', () => {
    const { family, group } = newFamily();
    const familyPick = proxyPick();
    const ownPick = proxyPick();
    registerEntityPickFamily({ family, picks: [familyPick] });
    const command = commandAt([...group, 'describe']);
    deferEntityPicks(command, [ownPick]);
    expect(getEntityPicks(command)).toEqual([ownPick]);
  });

  it('say that the option has a pick when the family provides it', () => {
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick()] });
    const command = commandAt([...group, 'describe']);
    expect(hasEntityPick(command, 'proxyId')).toBe(true);
    expect(hasEntityPick(command, 'other')).toBe(false);
  });
});

describe('resolveFamilyEntityPicks outside the prompt gate', () => {
  it('is a no-op: no load, the option untouched, true returned', async () => {
    process.env.FRODO_TEST = '1';
    const { family, group } = newFamily();
    registerEntityPickFamily({ family, picks: [proxyPick()] });
    const command = commandAt([...group, 'describe']);
    expect(await resolveFamilyEntityPicks(command)).toBe(true);
    expect(command.getOptionValue('proxyId')).toBeUndefined();
  });

  it('is true for a command with no family at all', async () => {
    process.env.FRODO_TEST = '1';
    expect(
      await resolveFamilyEntityPicks(commandAt(['zone', 'none', 'describe']))
    ).toBe(true);
  });
});
