import { beforeAll, describe, expect, it } from '@jest/globals';
import { fullName, loadLeafCommands } from '../utils/CommandExamples.js';

const { getEntityPicks } =
  await import('../../src/utils/interactive/EntityPickers.ts');
const { familyEntityPicks } =
  await import('../../src/utils/interactive/EntityPickRegistry.ts');

/**
 * Decision record 0038, families admin, admin federation, feature, idm,
 * mapping and server: the commands of the real command tree that inherit a
 * pick from these families, and only those. A command that takes an option of
 * the same name but must not get a picker (it names a client that does not
 * exist yet, or the option is optional) would otherwise inherit it without a
 * word, because a family matches by command path and option name.
 */

const EXPECTED = {
  // the client, then the user it gets tokens for
  'frodo admin execute-rfc7523-authz-grant-flow': ['clientId', 'sub'],
  'frodo admin get-access-token': ['clientId'],
  'frodo admin federation export': ['idpId'],
  'frodo feature describe': ['featureId'],
  'frodo feature install': ['featureId'],
  'frodo feature validate': ['featureId'],
  'frodo idm export': ['entityId'],
  'frodo idm delete': ['id'],
  'frodo mapping export': ['mappingId'],
  'frodo mapping rename': ['mappingId'],
  // narrows the list by -c and -t (see below)
  'frodo mapping delete': ['mappingId'],
  'frodo server export': ['serverId'],
};

const IN_THESE_FAMILIES =
  /^frodo (admin|feature|idm|mapping|server)( |$)(?!remote-proxy)/;

let leaves = [];

beforeAll(async () => {
  leaves = await loadLeafCommands();
});

describe('the commands that inherit a pick from the admin, feature, idm, mapping and server families', () => {
  it('are the ones that name an existing entity by a required option, and no others', () => {
    const inherited = Object.fromEntries(
      leaves
        .filter((leaf) => IN_THESE_FAMILIES.test(fullName(leaf)))
        .map((leaf) => [
          fullName(leaf),
          familyEntityPicks(leaf).map((pick) => pick.name),
        ])
        .filter(([, picks]) => picks.length > 0)
    );
    expect(inherited).toEqual(EXPECTED);
  });

  it('never give import, which takes its entity from a file, or the commands that create a client a picker', () => {
    for (const name of [
      'frodo admin federation import',
      'frodo idm import',
      'frodo mapping import',
      'frodo server import',
      'frodo admin create-oauth2-client-with-admin-privileges',
      'frodo admin grant-oauth2-client-admin-privileges',
      'frodo admin revoke-oauth2-client-admin-privileges',
      'frodo admin generate-rfc7523-authz-grant-artefacts',
    ]) {
      const leaf = leaves.find((candidate) => fullName(candidate) === name);
      expect(leaf).toBeDefined();
      expect(getEntityPicks(leaf)).toEqual([]);
    }
  });

  it('give mapping delete a pick that narrows the list by -c and -t, and idm delete the plain family pick', () => {
    const mappingDelete = leaves.find(
      (leaf) => fullName(leaf) === 'frodo mapping delete'
    );
    const [pick] = getEntityPicks(mappingDelete);
    expect(pick.name).toBe('mappingId');
    expect(pick.scopedBy).toEqual(['connectorId', 'managedObjectType']);

    const idmDelete = leaves.find(
      (leaf) => fullName(leaf) === 'frodo idm delete'
    );
    const [idmPick] = getEntityPicks(idmDelete);
    expect(idmPick.name).toBe('id');
    expect(idmPick.kind).toBe('config entity');
  });
});
