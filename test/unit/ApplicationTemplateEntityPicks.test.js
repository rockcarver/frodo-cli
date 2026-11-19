import { beforeAll, describe, expect, it } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

const { getEntityPicks } =
  await import('../../src/utils/interactive/EntityPickers.ts');

/**
 * The entity pickers of the real `app template` commands (decision record 0038).
 * The group has an entry of its own in the registry beside `app`, whose entries
 * name other options (`appId`, `appName`), so the tree has to be checked as
 * built: `describe` gets exactly one picker for -i and one for -n (a row per
 * template, not per version), and no other command of `app` gets a template
 * picker or loses its application picker.
 */

const templatePicks = (leaf) =>
  getEntityPicks(leaf).filter(
    (pick) => pick.name === 'templateId' || pick.name === 'templateName'
  );

let leaves = [];

beforeAll(async () => {
  leaves = (await loadLeafCommands()).filter((leaf) =>
    fullName(leaf).startsWith('frodo app ')
  );
});

describe('the pickers of the app template commands', () => {
  it('gives only `app template describe` the pickers, one for -i and one for -n', () => {
    const withPicker = leaves
      .filter((leaf) => templatePicks(leaf).length > 0)
      .map(fullName);
    expect(withPicker).toEqual(['frodo app template describe']);
    const describe = leaves.find(
      (leaf) => fullName(leaf) === 'frodo app template describe'
    );
    expect(getEntityPicks(describe).map((pick) => pick.name)).toEqual([
      'templateId',
      'templateName',
    ]);
  });

  it('keeps the application pickers of the other app commands', () => {
    const picks = (name) =>
      getEntityPicks(leaves.find((leaf) => fullName(leaf) === name)).map(
        (pick) => pick.name
      );
    expect(picks('frodo app delete')).toEqual(
      expect.arrayContaining(['appId'])
    );
    expect(picks('frodo app template list')).toEqual([]);
    expect(picks('frodo app template download')).toEqual([]);
  });

  it('lists the catalog the command reads, with the templates of the tenant, and shows ids and display names, never the key of a version', async () => {
    const describe = leaves.find(
      (leaf) => fullName(leaf) === 'frodo app template describe'
    );
    const [byId, byName] = templatePicks(describe);
    expect(byId.kind).toBe('application template');
    expect(byId.label({ templateId: '3_4-azure-ad', name: 'azure.ad' })).toBe(
      'azure.ad'
    );
    expect(
      byId.description({
        displayName: 'SAML',
        templateType: 'SAML',
        isOverride: true,
      })
    ).toBe('SAML · SAML · defined by the tenant');
    expect(
      byId.search(
        {
          templateId: '3_4-azure-ad',
          displayName: 'Microsoft Entra',
          name: 'azure.ad',
        },
        'entra'
      )
    ).toBe(true);
    expect(
      byName.label({ name: 'azure.ad', displayName: 'Microsoft Entra' })
    ).toBe('Microsoft Entra');
    // the loader for a command reads --templates and --channel from it
    expect(typeof byId.loadFor).toBe('function');
    expect(typeof byName.loadFor).toBe('function');
  });
});
