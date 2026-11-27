import fs from 'fs';
import {
  frodo,
  state,
  type FrodoError,
  type FullService,
  type ServiceNextDescendent,
} from '@rockcarver/frodo-lib';
import { combinedServiceError, importedServiceNameOf } from '../ops/ServiceOps';
import {
  nameInFolder,
  pulledFilePath,
  PulledPaths,
  realmFolderOf,
} from '../utils/ConfigTreePath';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';
import {
  isPlainName,
  PLAIN_NAME_RULE,
  printable,
  shownIdInSingleQuotes,
} from '../utils/PlainName';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const { getFilePath, saveJsonToFile, getWorkingDirectory, readJsonFile } =
  frodo.utils;
const { deleteFullService, getFullServices, importServices } = frodo.service;
const { DEFAULT_REALM_KEY } = frodo.utils.constants;

/** The services that `pull services` never exports and that a delete of all services leaves alone. */
export const EXCLUDE_SERVICES = ['DataStoreService'];

/**
 * The service that the library names in the error it throws when it cannot read a service.
 * @param {unknown} error the nested error of one service that could not be read
 * @returns {string | undefined} the service id, or undefined if the message has another shape
 */
function readServiceNameOf(error: unknown): string | undefined {
  return (error as Error)?.message?.match(/ service '(.+)'$/)?.[1];
}

/**
 * Export all services to separate files in fr-config-manager format
 * The library reads the services of a realm in one call that throws one error naming each service it could not read
 * and returns none of the others: those services are reported and the other realms are still exported.
 * @param {string} realm The realm to export services from
 * @param {string} name The name of the service to export
 * @param {boolean} allowFailures true to succeed although some services could not be exported (the failures are still summarised)
 * @returns {Promise<boolean>} false if a named service does not exist, the realms cannot be listed, or a service cannot be read or exported (unless failures are allowed). No services when none was named is a success.
 */
export async function configManagerExportServices(
  realm?: string,
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    const run = new OperationRun({ unit: 'service', allowFailures });
    let exported = 0;
    const pulledPaths = new PulledPaths();
    for (const realm of realms) {
      if (
        realm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      // the tenant names the realm: it is the name of a folder here, never a path
      const realmDir = run.deriveOrFail(
        `realm ${realm}`,
        () => realmFolderOf(realm),
        'Its services are not pulled.'
      );
      if (realmDir === undefined) continue;
      state.setRealm(realm);
      let services: FullService[];
      try {
        services = await getFullServices(false);
      } catch (error) {
        printError(error, `Error reading the services of realm ${realmDir}`);
        const nested = (error as FrodoError)?.originalErrors;
        if (
          Array.isArray(nested) &&
          nested.length > 0 &&
          nested.every((item) => readServiceNameOf(item))
        ) {
          // one nested error per service that could not be read
          run.recordCombinedError(error, {
            total: 0,
            fallbackName: `realm ${realmDir}`,
            itemName: (item) => `${realmDir}/${readServiceNameOf(item)}`,
          });
        } else {
          // the realm's services could not even be listed
          run.recordFailure(`realm ${realmDir}`, causeOf(error));
        }
        continue;
      }
      const fileDir = `realms/${realmDir}/services`;
      for (const service of services) {
        if (
          EXCLUDE_SERVICES.includes(service._type._id) ||
          (name && name !== service._type._id)
        ) {
          continue;
        }
        const serviceName = `${realmDir}/${service._type._id}`;
        exported++;
        try {
          if (service.nextDescendents?.length > 0) {
            for (const descendent of service.nextDescendents) {
              pulledPaths.owner = `${service._type._id}/${descendent._id}`;
              saveJsonToFile(
                descendent,
                getFilePath(
                  pulledFilePath(
                    `${fileDir}/${nameInFolder(service._type._id)}/${nameInFolder(descendent._id)}.json`,
                    pulledPaths
                  ),
                  true
                ),
                false,
                true
              );
            }
          }
          delete service.nextDescendents;
          pulledPaths.owner = service._type._id;
          saveJsonToFile(
            service,
            getFilePath(
              pulledFilePath(
                `${fileDir}/${nameInFolder(service._type._id)}.json`,
                pulledPaths
              ),
              true
            ),
            false,
            true
          );
          run.recordSuccess();
        } catch (error) {
          printError(error, `Error exporting service ${serviceName}`);
          run.recordFailure(serviceName, causeOf(error));
        }
      }
    }
    if (exported === 0 && !run.hasFailures) {
      if (name) {
        printMessage(`Service '${name}' not found.`, 'error');
        return false;
      }
      printMessage('No services found to export.');
      return true;
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Service export failed');
  }
  return false;
}

/**
 * Process services for a realm in fr-config-manager format.
 * A service file that cannot be read or parsed is recorded as a failed service in the run and left out.
 * @param {string} realmDir realm directory name
 * @param {OperationRun} run the run that tracks the services of the command
 * @returns {Promise<FullService[]>} services with descendants attached, or [] if the directory doesn't exist
 */
async function processImportServices(
  realmDir: string,
  run: OperationRun
): Promise<FullService[]> {
  const realmsDir = `${getWorkingDirectory()}/realms/${realmDir}/services`;
  if (!fs.existsSync(realmsDir)) {
    return [];
  }

  const results: FullService[] = [];
  const entries = fs.readdirSync(realmsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.name.endsWith('.json')) {
      continue;
    }

    const baseName = entry.name.replace('.json', '');
    try {
      const service = readJsonFile(`${realmsDir}/${entry.name}`) as FullService;

      const subDirPath = `${realmsDir}/${baseName}`;

      const descendants: ServiceNextDescendent[] = [];
      if (fs.existsSync(subDirPath) && fs.statSync(subDirPath).isDirectory()) {
        for (const subEntry of fs.readdirSync(subDirPath, {
          withFileTypes: true,
        })) {
          if (!subEntry.name.endsWith('.json')) {
            continue;
          }
          descendants.push(
            readJsonFile(
              `${subDirPath}/${subEntry.name}`
            ) as ServiceNextDescendent
          );
        }
      }
      service.nextDescendents = descendants;

      results.push(service);
    } catch (error) {
      printError(error, `Error reading service ${realmDir}/${baseName}`);
      run.recordFailure(`${realmDir}/${baseName}`, causeOf(error));
    }
  }

  return results;
}
/**
 * Import all services from disk in fr-config-manager format. Iterates every realm
 * directory under realms/, mapping the 'root' directory to the '/' realm, and skips
 * the root realm on cloud deployments.
 * The library imports the services of a realm in one call that tries every service and throws one error naming each
 * service it could not import: those are reported and the other services and realms are still imported.
 * @param {string} name optional service name to import, imports all services if omitted
 * @param {string} realm option realm to import services to
 * @param {boolean} allowFailures true to succeed although some services could not be imported (the failures are still summarised)
 * @returns {Promise<boolean>} false if the realms folder or a named service does not exist, or a service cannot be read or imported (unless failures are allowed). No services when none was named is a success.
 */
export async function configManagerImportServices(
  name?: string,
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing services...'
  );
  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    if (!fs.existsSync(realmsDir)) {
      stopProgressIndicator(
        indicatorId,
        `Realms folder not found: ${realmsDir}`,
        'fail'
      );
      return false;
    }

    const realmsToProcess =
      realm && realm !== DEFAULT_REALM_KEY
        ? [realm === '/' ? 'root' : realm]
        : fs
            .readdirSync(realmsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);

    const run = new OperationRun({ unit: 'service', allowFailures });
    let selectedCount = 0;
    for (const realmDir of realmsToProcess) {
      if (
        realmDir === 'root' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        continue;
      }
      state.setRealm(realmDir === 'root' ? '/' : realmDir);

      const services = (await processImportServices(realmDir, run)).filter(
        (s) => !name || name === s._type._id
      );
      if (services.length === 0) continue;
      selectedCount += services.length;
      const importData = {
        service: Object.fromEntries(services.map((s) => [s._type._id, s])),
      };
      try {
        await importServices(importData, {
          clean: false,
          global: false,
          realm: true,
        });
        for (let i = 0; i < services.length; i++) run.recordSuccess();
      } catch (error) {
        printError(error);
        run.recordCombinedError(combinedServiceError(error), {
          total: services.length,
          fallbackName: `realm ${realmDir}`,
          itemName: (nested) => {
            const serviceName = importedServiceNameOf(nested);
            return serviceName ? `${realmDir}/${serviceName}` : undefined;
          },
        });
      }
    }
    if (selectedCount === 0 && !run.hasFailures) {
      if (name) {
        stopProgressIndicator(
          indicatorId,
          `Service '${name}' not found in ${realmsDir}`,
          'fail'
        );
        return false;
      }
      stopProgressIndicator(
        indicatorId,
        `No services found to import in ${realmsDir}`,
        'success'
      );
      return true;
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? 'Service import completed with failures.'
        : 'Service import completed.',
      run.hasFailures ? 'fail' : 'success'
    );
    return run.finish();
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Service import failed.', 'fail');
    printError(error, 'Error importing services');
  }
  return false;
}

/**
 * What a realm commonly depends on, for the services that are known for it: what goes with the
 * service when it is deleted, in a few words. A delete of all services says so for each of them in
 * its plan and a named delete says so after it ran. AM accepts the deletion of every one of them, and
 * nothing in the library says what uses a service, so this is a hint and not a refusal. The effects are
 * those that the documentation of the platform or the recordings of the services describe (the identity
 * stores that go with `id-repositories` are known from recordings); none was observed by this command.
 */
const REALM_SERVICE_NOTES: Record<string, string> = {
  'id-repositories': 'the identity stores of the realm go with it',
  'oauth-oidc':
    'the OAuth 2.0 provider of the realm, with its endpoints, goes with it',
  SocialIdentityProviders:
    'every social identity provider of the realm goes with it',
  email: 'the sender address and the mail transports of the realm go with it',
  pingOneWorkerService: 'the PingOne connection of the realm goes with it',
  selfServiceTrees:
    'the choice of the journey that runs each self-service flow goes with it',
  session: 'the session settings of the realm go with it',
  baseurl: 'the way the base URL of the realm is generated goes with it',
  validation: 'the list of the valid goto URLs of the realm goes with it',
  DataStoreService:
    'pull services never exports what it holds, so push services cannot bring it back',
};

/** The note of a service that a realm commonly depends on, or undefined. */
function noteOf(id: string): string | undefined {
  return Object.hasOwn(REALM_SERVICE_NOTES, id)
    ? REALM_SERVICE_NOTES[id]
    : undefined;
}

/** The sentence about a service that a realm commonly depends on, for a delete that names it, or undefined. */
function dependsLine(id: string): string | undefined {
  const note = noteOf(id);
  return note
    ? `Service '${id}' is one that a realm commonly depends on: ${note}.`
    : undefined;
}

/** One service of a realm that the delete would try, as the realm listed it. */
type ServiceToDelete = {
  realm: string;
  /** The id the realm lists: `service._type._id`, the key that `pull services` uses. */
  id: string;
  /** The next descendents that go with it, as `<type>/<id>`, written out. */
  descendents: string[];
  /** The next descendents whose type or id is not a plain name, as `<type>/<id>`, written out. */
  unsafeDescendents: string[];
};

/** What the library gave back for the services of one realm. */
type RealmRead = {
  realm: string;
  services: FullService[];
  /** The services that could not be read: they are not deleted. */
  unreadable: { id: string; reason: string; error: FrodoError }[];
  /** Why the services of the realm could not be listed, when they could not. */
  failure?: string;
};

/**
 * Reads the services of a realm the way `pull services` does (every service with its next
 * descendents, the services that Cloud does not offer left out). A service that cannot be read does
 * not stop the others: it is reported and not deleted.
 * @param {string} realm the realm
 * @returns {Promise<RealmRead>} the services, the ones that could not be read, or why none could be listed
 */
async function readServicesOfRealm(realm: string): Promise<RealmRead> {
  state.setRealm(realm);
  const unreadable: RealmRead['unreadable'] = [];
  try {
    const services = await getFullServices(false, (error?: FrodoError) => {
      if (!error) return;
      unreadable.push({
        id: readServiceNameOf(error) ?? 'a service',
        reason: causeOf(error),
        error,
      });
    });
    return { realm, services, unreadable };
  } catch (error) {
    printError(error, `Error reading the services of realm '${realm}'`);
    return { realm, services: [], unreadable, failure: causeOf(error) };
  }
}

/** The id that a realm lists for a service: a text, so that an id of another shape is refused as a name and not as a crash. */
const listedIdOf = (service: FullService): string =>
  String(service?._type?._id ?? '');

/** What a service of the realm is, for the delete: its id, and its next descendents with the ones that are not plain names apart. */
function toDeleteOf(realm: string, service: FullService): ServiceToDelete {
  const descendents: string[] = [];
  const unsafeDescendents: string[] = [];
  for (const descendent of service.nextDescendents ?? []) {
    const type = String(descendent?._type?._id ?? '');
    const id = String(descendent?._id ?? '');
    const shown = printable(`${type}/${id}`);
    descendents.push(shown);
    if (!isPlainName(type) || !isPlainName(id)) unsafeDescendents.push(shown);
  }
  return { realm, id: listedIdOf(service), descendents, unsafeDescendents };
}

/** The realm as a summary names it: the root realm is `root`, as everywhere in the group. */
const realmNameInRun = (realm: string): string =>
  realm === '/' ? 'root' : realm;

/** What a service is called in the summary of a run: `alpha/email`, `root/session` for the root realm. */
const nameInRun = (realm: string, id: string): string =>
  `${realmNameInRun(realm)}/${printable(id)}`;

/** Why a service is not deleted: something it names is not a plain name. */
type Refusal = {
  /** The service, as the summary names it: `<realm>/<service>`. */
  name: string;
  /** The reason, as the summary gives it. */
  reason: string;
  /** One line for each id that is not a plain name. */
  messages: string[];
  /** The ids that are not plain names, as `<realm>/<service>` or `<realm>/<service>/<type>/<id>`. */
  listed: string[];
};

/**
 * What stops a service from being deleted without sending an id that names another object: its own id that
 * is not a plain name, or a next descendent whose type or id is not. The service is one failure of the run,
 * named `<realm>/<service>`, however many of its next descendents are such; each of them has a line of its own.
 * @param {ServiceToDelete} target the service
 * @returns {Refusal | undefined} why it is refused, or undefined if the service can be deleted
 */
function refusalOf(target: ServiceToDelete): Refusal | undefined {
  const name = nameInRun(target.realm, target.id);
  if (!isPlainName(target.id)) {
    return {
      name,
      reason: 'its id is not a plain name',
      messages: [
        `Service ${shownIdInSingleQuotes(target.id)} is listed in realm '${target.realm}' with an id that is not a plain name (${PLAIN_NAME_RULE}): it is not deleted, and no request was sent for it.`,
      ],
      listed: [name],
    };
  }
  const unsafe = target.unsafeDescendents;
  if (unsafe.length === 0) return undefined;
  const many = unsafe.length > 1;
  return {
    name,
    reason: `its next descendent${many ? 's' : ''} ${unsafe.join(', ')} ${many ? 'have' : 'has'} a type or an id that is not a plain name`,
    messages: unsafe.map(
      (descendent) =>
        `Next descendent '${descendent}' of service '${target.id}' is listed in realm '${target.realm}' with a type or an id that is not a plain name (${PLAIN_NAME_RULE}): the service is not deleted, and no request was sent for it.`
    ),
    listed: unsafe.map((descendent) => `${name}/${descendent}`),
  };
}

/** `1 service` or `3 services`. */
const countOf = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * What a delete of all services would do, as the text of a plan or of a dry run: how many services
 * in which realms, each service with the number of its next descendents and, for the ones that a
 * realm commonly depends on, what goes with them.
 * @param {ServiceToDelete[][]} byRealm what would be deleted, one list for each realm that has any
 * @param {boolean} asPlan true for the plan shown before a question, false for a dry run
 * @returns {string[]} the lines
 */
function bulkPlanLines(
  byRealm: ServiceToDelete[][],
  asPlan: boolean
): string[] {
  const total = byRealm.reduce((sum, services) => sum + services.length, 0);
  const realms = byRealm.map((services) => services[0].realm);
  const what = `${countOf(total, 'service')} in ${countOf(realms.length, 'realm')} (${realms.join(', ')}) would be deleted, each with its next descendents.`;
  const lines = [
    asPlan ? `Plan: ${what}` : `Dry run: nothing is deleted. ${what}`,
  ];
  for (const services of byRealm) {
    lines.push(
      `  Realm '${services[0].realm}' (${countOf(services.length, 'service')}):`
    );
    for (const service of services) {
      const note = noteOf(service.id);
      lines.push(
        `    - ${service.id}${service.descendents.length > 0 ? ` (${countOf(service.descendents.length, 'next descendent')})` : ''}${note ? `: ${note}` : ''}`
      );
    }
  }
  return lines;
}

/**
 * Delete one service of a realm by id, or all services of the selected realms: what
 * `pull services` covers (every realm service that the realm lists and reads, except
 * `DataStoreService`, which it never exports). Global services are not touched. Skips the root
 * realm on Cloud deployments.
 *
 * The services of a realm are read the way `pull services` reads them. A named service is looked up
 * in that list (an exact, case-sensitive match on the id the realm lists) and the LISTED id is what is
 * deleted: the text of the command line never reaches a request, so it cannot be anything but an id. An
 * id that the realm lists for a service, or a type or an id of one of its next descendents, that is not a
 * plain name is never sent to the tenant either: the service is not deleted. A service that other objects
 * use is not refused: nothing in the library says what uses a service, so the plan and the messages say
 * which services a realm commonly depends on and what goes with them.
 *
 * Every service is one operation, named `<realm>/<service>`: one that cannot be read or deleted does
 * not stop the others, and the command ends with one summary and the answer to "did it succeed". A
 * named delete counts only the service that was named: another service of the realm that cannot be
 * read is a warning. A dry run reads and deletes nothing, and says what would be deleted and which
 * failures it would have.
 * @param {string} id Exact id of the service, for example `email`. A named delete needs a realm. An empty id is an error, never "all".
 * @param {string} realm Realm to process. Omit to process every realm of the tenant.
 * @param {boolean} dryRun Show what would be deleted without deleting anything.
 * @param {boolean} allowFailures Keep the result true when a service could not be read or deleted, or the services of a realm could not be listed. A named service that is not there is not a failure that it can turn into success.
 * @param {object} options `plan`: the dry run of a delete of all services is the plan that is shown before a question, so its text says plan and not dry run
 * @param {boolean} options.plan true for the plan shown before a question
 * @returns {Promise<boolean>} False if the arguments are refused, the realms cannot be listed, a named service is not there or its id, or the type or id of one of its next descendents, is not a plain name, or, unless failures are allowed, a service or the services of a realm could not be read or deleted. Nothing to delete is a success.
 */
export async function configManagerDeleteServices(
  id?: string,
  realm?: string,
  dryRun = false,
  allowFailures = false,
  { plan = false }: { plan?: boolean } = {}
): Promise<boolean> {
  // "not given" and "given but empty" are different: an empty id must never select every service
  if (id !== undefined && id.trim() === '') {
    printMessage(
      'The service id must not be empty. To delete all services, leave out the id.',
      'error'
    );
    return false;
  }
  const concreteRealm =
    realm && realm !== DEFAULT_REALM_KEY ? realm : undefined;
  if (id !== undefined && !concreteRealm) {
    printMessage(
      'The -i, --service-id option requires a realm argument to be specified.',
      'error'
    );
    return false;
  }
  // the realm is set for each realm below; the caller (the question of the bulk-delete guard names
  // the realm) must find it as it was
  const realmBefore = state.getRealm();
  try {
    let realms: string[];
    try {
      realms = concreteRealm ? [concreteRealm] : await realmList();
    } catch (error) {
      printError(error, 'Error reading realms');
      return false;
    }
    if (realms.length === 0) {
      printMessage('No realms found to delete services from.', 'warn');
      return true;
    }
    // a realm that is refused, or whose services could not be listed, is one failed operation, like any other
    const run = new OperationRun({ unit: 'service', allowFailures });
    const reads: RealmRead[] = [];
    let realmsRefused = 0;
    for (const currentRealm of realms) {
      if (
        currentRealm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        printMessage('The root realm (/) is skipped on a Cloud tenant.');
        continue;
      }
      // the tenant names the realm: it is a realm name, never a path (`pull services` asks the same)
      if (
        run.deriveOrFail(
          `realm ${currentRealm}`,
          () => realmFolderOf(currentRealm),
          'Its services are not deleted.'
        ) === undefined
      ) {
        realmsRefused++;
        continue;
      }
      reads.push(await readServicesOfRealm(currentRealm));
    }

    for (const read of reads) {
      if (read.failure !== undefined) {
        run.recordFailure(`realm ${realmNameInRun(read.realm)}`, read.failure);
      }
      for (const unread of read.unreadable) {
        if (id !== undefined && unread.id !== id) {
          // a named delete is about the service that was named: another one that cannot be read is no failure of it
          printMessage(
            `Service '${printable(unread.id)}' of realm '${read.realm}' could not be read, and was not named: ${unread.reason}`,
            'warn'
          );
          continue;
        }
        printError(unread.error);
        run.recordFailure(nameInRun(read.realm, unread.id), unread.reason);
      }
    }

    // what the realm lists, by realm: a named delete takes the one service, a delete of all what
    // `pull services` covers
    const selected = reads.map((read) => {
      const listed = read.services.filter(
        (service) =>
          (id === undefined &&
            !EXCLUDE_SERVICES.includes(listedIdOf(service))) ||
          (id !== undefined && listedIdOf(service) === id)
      );
      return {
        read,
        toDelete: listed.map((service) => toDeleteOf(read.realm, service)),
      };
    });
    const found = selected.flatMap((entry) => entry.toDelete);

    if (id !== undefined) {
      const target = found[0];
      if (!target) {
        const reported =
          realmsRefused > 0 ||
          reads.some(
            (read) =>
              read.failure !== undefined ||
              read.unreadable.some((unread) => unread.id === id)
          );
        // a named service that is not there fails the command whatever `--allow-failures` says
        if (!reported) {
          printMessage(
            `Service '${id}' not found in realm '${concreteRealm}'.`,
            'error'
          );
          return false;
        }
        return run.finish();
      }
      const refusal = refusalOf(target);
      if (refusal) {
        for (const message of refusal.messages) printMessage(message, 'error');
        return false;
      }
      const depends = dependsLine(target.id);
      if (dryRun) {
        printMessage(
          [
            `Dry run: Deleting service '${target.id}' in realm '${target.realm}'.`,
            ...(target.descendents.length > 0
              ? [
                  `  Next descendents that go with it: ${target.descendents.join(', ')}`,
                ]
              : []),
            ...(depends ? [`  ${depends}`] : []),
          ].join('\n')
        );
        return run.finish();
      }
    } else {
      for (const { read, toDelete } of selected) {
        if (
          toDelete.length === 0 &&
          read.failure === undefined &&
          read.unreadable.length === 0
        ) {
          printMessage(
            `No services found to delete in realm '${read.realm}'.`,
            'warn'
          );
        }
      }
      if (dryRun) {
        // the failures that a real run would have are the failures of the dry run: it says how it would end
        const blocked: string[] = [];
        const deletable = selected
          .map(({ toDelete }) =>
            toDelete.filter((service) => {
              const refusal = refusalOf(service);
              if (refusal) {
                run.recordFailure(refusal.name, refusal.reason);
                blocked.push(...refusal.listed);
              } else {
                run.recordSuccess();
              }
              return refusal === undefined;
            })
          )
          .filter((services) => services.length > 0);
        const lines =
          deletable.length > 0 ? bulkPlanLines(deletable, plan) : [];
        if (blocked.length > 0) {
          lines.push(
            `  These listed ids (of a service, or of a next descendent that goes with it) are not plain names (${PLAIN_NAME_RULE}). No request would be sent for them, the service would not be deleted, and it would count as one failed delete: ${blocked.join(', ')}.`
          );
        }
        const dataStore = reads.filter((read) =>
          read.services.some((service) =>
            EXCLUDE_SERVICES.includes(listedIdOf(service))
          )
        );
        if (dataStore.length > 0) {
          lines.push(
            `  ${EXCLUDE_SERVICES.join(', ')} is never deleted by a delete of all services.`
          );
        }
        if (lines.length > 0) printMessage(lines.join('\n'));
        const ended = run.finish();
        // the plan before a question: the question is not asked, and the user is told why and what is left
        if (plan && blocked.length > 0) {
          printMessage(
            `Nothing was asked and nothing was deleted: a delete of all services stops at a plan with ids that are not plain names (${blocked.join(', ')}). With -y the other services are deleted and the ones named here count as failed; with -i one service is deleted.`,
            'error'
          );
        }
        return ended;
      }
    }

    for (const target of found) {
      const refusal = refusalOf(target);
      if (refusal) {
        for (const message of refusal.messages) printMessage(message, 'error');
        run.recordFailure(refusal.name, refusal.reason);
        continue;
      }
      state.setRealm(target.realm);
      try {
        await deleteFullService(target.id);
        run.recordSuccess();
        printMessage(
          `Deleted service '${target.id}' in realm '${target.realm}'${target.descendents.length > 0 ? ` (with next descendents: ${target.descendents.join(', ')})` : ''}.`
        );
        const depends = dependsLine(target.id);
        if (id !== undefined && depends) printMessage(depends, 'warn');
      } catch (error) {
        printError(
          error,
          `Error deleting service '${target.id}' in realm '${target.realm}'`
        );
        run.recordFailure(nameInRun(target.realm, target.id), causeOf(error));
      }
    }
    return run.finish();
  } finally {
    state.setRealm(realmBefore);
  }
}
