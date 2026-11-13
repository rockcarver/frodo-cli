import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity picks of `frodo app template describe` (decision record 0038):
// one row per template, not per version, by id for -i and by display name for
// -n. The version is not picked: -v names it and the newest is the default.

registerEntityPickFamilies();

const listItem = (
  name: string,
  version: string,
  displayName: string,
  more: Record<string, unknown> = {}
) => ({
  templateId: `${version.replace(/\./g, '_')}-${name.replace(/\./g, '-')}`,
  name,
  group: name,
  tier: 'enterprise' as const,
  templateVersion: version,
  displayName,
  templateType: 'Enterprise',
  dateUpdated: '01-01-2025',
  isOverride: false,
  newestInGroup: false,
  ...more,
});

/** Two versions of one template, the older one listed first, and a template with one. */
const list = () => [
  listItem('azure.ad', '3.3', 'Microsoft Entra'),
  listItem('azure.ad', '3.4', 'Microsoft Entra', { newestInGroup: true }),
  listItem('saml', '1.3', 'SAML', {
    newestInGroup: true,
    isOverride: true,
    templateType: 'SAML',
  }),
];

/** The command `frodo app template <verb>` with the given options. */
function describeCommand(verb: string, ...flags: string[]): Command {
  const root = new Command('frodo');
  const app = new Command('app');
  const template = new Command('template');
  const leaf = new Command(verb);
  for (const flag of flags) leaf.addOption(new Option(flag));
  root.addCommand(app);
  app.addCommand(template);
  template.addCommand(leaf);
  return leaf;
}

const flags = [
  '-i, --template-id <template-id>',
  '-n, --template-name <template-name>',
  '--channel <channel>',
];

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the application template pickers', () => {
  it('give a command that has -i and -n a pick for each, and a command without them none', () => {
    expect(
      familyEntityPicks(describeCommand('describe', ...flags)).map(
        (pick) => pick.name
      )
    ).toEqual(['templateId', 'templateName']);
    expect(familyEntityPicks(describeCommand('list'))).toEqual([]);
    expect(familyEntityPicks(describeCommand('download'))).toEqual([]);
  });

  it('list one row per template, the newest version of it, in the order of the list', async () => {
    const read = jest
      .spyOn(frodo.app.template, 'listTemplates')
      .mockResolvedValue(list());
    const [byId, byName] = familyEntityPicks(
      describeCommand('describe', ...flags)
    );
    for (const pick of [byId, byName]) {
      const rows = await pick.load();
      expect(rows.map((row) => `${row.name} ${row.templateVersion}`)).toEqual([
        'azure.ad 3.4',
        'saml 1.3',
      ]);
    }
    // the tenant's templates are merged in: the picker runs after a login
    expect(read).toHaveBeenCalledWith({ includeOverrides: true });
  });

  it('read the catalog the command was given, not only the default', async () => {
    const read = jest
      .spyOn(frodo.app.template, 'listTemplates')
      .mockResolvedValue(list());
    const command = describeCommand('describe', ...flags);
    command.setOptionValue('channel', 'development');
    const [pick] = familyEntityPicks(command);
    await pick.loadFor?.(command);
    expect(read).toHaveBeenCalledWith({
      channel: 'development',
      includeOverrides: true,
    });
  });

  it('write the id for -i and the display name for -n, and never the key the catalog keeps a version under', () => {
    const [azure, saml] = list().filter((item) => item.newestInGroup);
    const [byId, byName] = familyEntityPicks(
      describeCommand('describe', ...flags)
    );
    expect(byId.label(azure)).toBe('azure.ad');
    expect(byName.label(azure)).toBe('Microsoft Entra');
    expect(byName.label({ ...azure, displayName: undefined })).toBe('azure.ad');
    // what a row says besides its label
    expect(byId.description?.(azure)).toBe('Microsoft Entra · Enterprise');
    expect(byId.description?.(saml)).toBe(
      'SAML · SAML · defined by the tenant'
    );
    expect(byName.description?.(azure)).toBe('azure.ad');
    for (const row of [azure, saml]) {
      for (const pick of [byId, byName]) {
        expect(pick.label(row)).not.toMatch(/\d_\d+-/);
        expect(pick.value).toBeUndefined();
      }
    }
  });

  it('are searched by id and by display name, in either picker', () => {
    const [azure] = list().filter((item) => item.newestInGroup);
    for (const pick of familyEntityPicks(
      describeCommand('describe', ...flags)
    )) {
      expect(pick.search?.(azure, 'azure')).toBe(true);
      expect(pick.search?.(azure, 'ENTRA')).toBe(true);
      expect(pick.search?.(azure, 'saml')).toBe(false);
    }
  });
});
