import { frodo } from '@rockcarver/frodo-lib';

import { printMessage } from '../utils/Console';

const { queryManagedObjects } = frodo.idm.managed;
const { getRealmManagedOrganization } = frodo.idm.organization;

// unfinished work
export async function listOrganizationsTopDown() {
  try {
    const orgs = await queryManagedObjects(
      getRealmManagedOrganization(),
      'true',
      ['name', 'parent/*/name', 'children/*/name']
    );
    return orgs;
  } catch (queryAllManagedObjectsByTypeError) {
    printMessage(queryAllManagedObjectsByTypeError, 'error');
    printMessage(
      `Error querying ${getRealmManagedOrganization()} objects: ${queryAllManagedObjectsByTypeError}`,
      'error'
    );
  }
}
