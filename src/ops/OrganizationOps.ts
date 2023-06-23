import { frodo } from '@rockcarver/frodo-lib';
import { printMessage } from '../utils/Console';

const { queryAllManagedObjectsByType } = frodo.idm.config;
const { getRealmManagedOrganization } = frodo.idm.organization;

// unfinished work
export async function listOrganizationsTopDown() {
  const orgs = [];
  let result = {
    result: [],
    resultCount: 0,
    pagedResultsCookie: null,
    totalPagedResultsPolicy: 'NONE',
    totalPagedResults: -1,
    remainingPagedResults: -1,
  };
  do {
    try {
      // eslint-disable-next-line no-await-in-loop
      result = await queryAllManagedObjectsByType(
        getRealmManagedOrganization(),
        ['name', 'parent/*/name', 'children/*/name'],
        result.pagedResultsCookie
      );
    } catch (queryAllManagedObjectsByTypeError) {
      printMessage(queryAllManagedObjectsByTypeError, 'error');
      printMessage(
        `Error querying ${getRealmManagedOrganization()} objects: ${queryAllManagedObjectsByTypeError}`,
        'error'
      );
    }
    orgs.concat(result.result);
    printMessage('.', 'text', false);
  } while (result.pagedResultsCookie);
  return orgs;
}
