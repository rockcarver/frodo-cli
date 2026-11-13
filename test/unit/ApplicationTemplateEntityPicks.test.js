import { beforeAll, describe, expect, it } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

const { getEntityPicks } =
  await import('../../src/utils/interactive/EntityPickers.ts');

/**
 * The entity picker of the real `app template` commands (decision record 0038).
 * The group has an entry of its own in the registry beside `app`, whose entries
 * name other options (`appId`, `appName`), so the tree has to be checked as
 * built: `describe` gets exactly one picker for -i, and no other command of
 * `app` gets a template picker or loses its application picker.
 */

const templateIdPicks = (leaf) =>
  getEntityPicks(leaf).filter((pick) => pick.name === 'templateId');

let leaves = [];

beforeAll(async () => {
  leaves = (await loadLeafCommands()).filter((leaf) =>
    fullName(leaf).startsWith('frodo app ')
  );
});

describe('the pickers of the app template commands', () => {
  it('gives only `app template describe` a picker, and exactly one', () => {
    const withPicker = leaves
      .filter((leaf) => templateIdPicks(leaf).length > 0)
      .map(fullName);
    expect(withPicker).toEqual(['frodo app template describe']);
    const describe = leaves.find(
      (leaf) => fullName(leaf) === 'frodo app template describe'
    );
    expect(getEntityPicks(describe).length).toBe(1);
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

  it('lists the catalog the command reads, with the templates of the tenant, and shows ids', async () => {
    const describe = leaves.find(
      (leaf) => fullName(leaf) === 'frodo app template describe'
    );
    const [pick] = templateIdPicks(describe);
    expect(pick.kind).toBe('application template');
    expect(pick.label({ templateId: '1_2-saml', name: 'saml' })).toBe(
      '1_2-saml'
    );
    expect(
      pick.description({
        displayName: 'SAML',
        templateType: 'SAML',
        isOverride: true,
      })
    ).toBe('SAML · SAML · defined by the tenant');
    expect(
      pick.search(
        {
          templateId: '3_3-azure-ad',
          displayName: 'Azure AD',
          name: 'azure.ad',
        },
        'azure'
      )
    ).toBe(true);
    // the loader for a command reads --templates and --channel from it
    expect(typeof pick.loadFor).toBe('function');
  });
});
