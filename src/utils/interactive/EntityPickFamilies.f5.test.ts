import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  frodo,
  type CustomNodeSkeleton,
  type ScriptSkeleton,
  type ThemeSkeleton,
  type TreeSkeleton,
} from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity picks of the families journey, node, script, theme and email
// template (decision record 0038): what each picker offers, how a row reads
// and which value it writes, and which commands of the family get it.

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

const picksOf = (path: string[], ...flags: string[]) =>
  familyEntityPicks(commandAt(path, ...flags));

const names = (path: string[], ...flags: string[]) =>
  picksOf(path, ...flags).map((pick) => pick.name);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the email template picker', () => {
  const flags = ['-i, --template-id <template-id>'];
  const template = (id: string) => ({ _id: `emailTemplate/${id}` });

  it('belongs to the commands that take an existing template, not to import', () => {
    expect(names(['email', 'template', 'delete'], ...flags)).toEqual([
      'templateId',
    ]);
    expect(names(['email', 'template', 'export'], ...flags)).toEqual([
      'templateId',
    ]);
    expect(names(['email', 'template', 'import'], ...flags)).toEqual([]);
  });

  it('offers the templates by id without the type prefix, and reads the stored ones', async () => {
    const read = jest
      .spyOn(frodo.email.template, 'readEmailTemplates')
      .mockResolvedValue([template('welcome'), template('forgotUsername')]);
    const [pick] = picksOf(['email', 'template', 'delete'], ...flags);
    const entities = await pick.load();
    expect(read).toHaveBeenCalledWith(false);
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'welcome',
      'forgotUsername',
    ]);
    expect(pick.kind).toBe('email template');
  });

  it('offers nothing, and does not fail, when there are no templates', async () => {
    jest
      .spyOn(frodo.email.template, 'readEmailTemplates')
      .mockResolvedValue([]);
    const [pick] = picksOf(['email', 'template', 'export'], ...flags);
    expect(await pick.load()).toEqual([]);
  });
});

describe('the journey picker', () => {
  const flags = ['-i, --journey-id <journey>'];
  const tree = (id: string) => ({ _id: id }) as TreeSkeleton;

  it('belongs to the commands that need a journey', () => {
    for (const verb of ['delete', 'export', 'enable', 'disable']) {
      expect(names(['journey', verb], ...flags)).toEqual(['journeyId']);
    }
  });

  it('does not belong to describe and validate, where -i only narrows what is covered, nor to import, which names a journey in a file', () => {
    for (const verb of ['describe', 'validate', 'import']) {
      expect(names(['journey', verb], ...flags)).toEqual([]);
    }
  });

  it('offers the journeys of the realm by id', async () => {
    jest
      .spyOn(frodo.authn.journey, 'readJourneys')
      .mockResolvedValue([tree('Login'), tree('Registration')]);
    const [pick] = picksOf(['journey', 'delete'], ...flags);
    const entities = await pick.load();
    expect(entities.map((entity) => pick.label(entity))).toEqual([
      'Login',
      'Registration',
    ]);
    expect(pick.kind).toBe('journey');
  });

  it('declines the pick when the realm cannot be read, so a command never runs on a failed load', async () => {
    jest
      .spyOn(frodo.authn.journey, 'readJourneys')
      .mockRejectedValue(new Error('403'));
    const [pick] = picksOf(['journey', 'export'], ...flags);
    await expect(pick.load()).rejects.toThrow('403');
  });
});

describe('the custom node picker', () => {
  const flags = ['-i, --node-id <node-id>', '-n, --node-name <node-name>'];
  const node = (id: string, displayName?: string, description?: string) =>
    ({ _id: id, displayName, description }) as CustomNodeSkeleton;

  it('offers the id and the name of a node on the commands that need one', () => {
    for (const verb of ['delete', 'export']) {
      expect(names(['node', verb], ...flags)).toEqual(['nodeId', 'nodeName']);
    }
  });

  it('does not belong to describe or type describe, where -i and -n only narrow what is described, nor to import', () => {
    for (const path of [
      ['node', 'describe'],
      ['node', 'type', 'describe'],
      ['node', 'import'],
    ]) {
      expect(names(path, ...flags)).toEqual([]);
    }
  });

  it('shows the display name and writes the id', async () => {
    jest
      .spyOn(frodo.authn.node, 'readCustomNodes')
      .mockResolvedValue([
        node('zion-node', 'Zion Node', 'opens the gate'),
        node('matrix'),
      ]);
    const [idPick] = picksOf(['node', 'delete'], ...flags);
    const entities = await idPick.load();
    expect(entities.map((entity) => idPick.label(entity))).toEqual([
      'Zion Node',
      'matrix',
    ]);
    expect(entities.map((entity) => idPick.value?.(entity))).toEqual([
      'zion-node',
      'matrix',
    ]);
    expect(idPick.description?.(entities[0])).toBe('opens the gate');
  });

  it('writes the display name for -n, and leaves out a node that has none', async () => {
    jest
      .spyOn(frodo.authn.node, 'readCustomNodes')
      .mockResolvedValue([
        node('zion-node', 'Zion Node', 'opens the gate'),
        node('matrix'),
      ]);
    const [, namePick] = picksOf(['node', 'delete'], ...flags);
    expect(namePick.name).toBe('nodeName');
    const entities = await namePick.load();
    expect(entities.map((entity) => namePick.label(entity))).toEqual([
      'Zion Node',
    ]);
    expect(namePick.value).toBeUndefined();
    expect(namePick.description?.(entities[0])).toBe('opens the gate');
  });
});

describe('the script picker', () => {
  const flags = ['-i, --script-id <uuid>', '-n, --script-name <name>'];
  const script = (id: string, name: string, description = '') =>
    ({ _id: id, name, description }) as ScriptSkeleton;

  it('offers the id and the name of a script on the commands that need one', () => {
    for (const verb of ['delete', 'describe', 'export']) {
      expect(names(['script', verb], ...flags)).toEqual([
        'scriptId',
        'scriptName',
      ]);
    }
    expect(names(['script', 'import'], ...flags)).toEqual([]);
  });

  it('shows the name and writes the uuid', async () => {
    jest
      .spyOn(frodo.script, 'readScripts')
      .mockResolvedValue([
        script('0001-aaaa', 'Matrix Check', 'checks the matrix'),
      ]);
    const [idPick] = picksOf(['script', 'delete'], ...flags);
    const entities = await idPick.load();
    expect(idPick.label(entities[0])).toBe('Matrix Check');
    expect(idPick.value?.(entities[0])).toBe('0001-aaaa');
    expect(idPick.description?.(entities[0])).toBe('checks the matrix');
  });

  it('writes the name for -n', async () => {
    jest
      .spyOn(frodo.script, 'readScripts')
      .mockResolvedValue([
        script('0001-aaaa', 'Matrix Check', 'checks the matrix'),
      ]);
    const [, namePick] = picksOf(['script', 'delete'], ...flags);
    expect(namePick.name).toBe('scriptName');
    const entities = await namePick.load();
    expect(namePick.label(entities[0])).toBe('Matrix Check');
    expect(namePick.value).toBeUndefined();
  });
});

describe('the theme picker', () => {
  const flags = ['-i, --theme-id <uuid>', '-n, --theme-name <name>'];
  const theme = (id: string, name: string, isDefault = false) =>
    ({ _id: id, name, isDefault }) as ThemeSkeleton;

  it('offers the id and the name of a theme on the commands that need one', () => {
    for (const verb of ['delete', 'export']) {
      expect(names(['theme', verb], ...flags)).toEqual([
        'themeId',
        'themeName',
      ]);
    }
    expect(names(['theme', 'import'], ...flags)).toEqual([]);
  });

  it('shows the name, writes the uuid and marks the default theme', async () => {
    jest
      .spyOn(frodo.theme, 'readThemes')
      .mockResolvedValue([
        theme('t-1', 'Starfield', true),
        theme('t-2', 'Zion'),
      ]);
    const [idPick] = picksOf(['theme', 'delete'], ...flags);
    const entities = await idPick.load();
    expect(entities.map((entity) => idPick.label(entity))).toEqual([
      'Starfield',
      'Zion',
    ]);
    expect(entities.map((entity) => idPick.value?.(entity))).toEqual([
      't-1',
      't-2',
    ]);
    expect(idPick.description?.(entities[0])).toBe('default theme');
    expect(idPick.description?.(entities[1])).toBeUndefined();
  });
});
