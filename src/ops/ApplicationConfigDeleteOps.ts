import { frodo, state } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { DEFAULT_REALM_KEY, CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

type ApplicationRecord = Awaited<
  ReturnType<typeof frodo.app.readApplicationByName>
>;
type ApplicationOwnership = Awaited<
  ReturnType<typeof frodo.app.readApplicationOwnership>
>;
type OwnedObjectResult = Awaited<
  ReturnType<typeof frodo.app.deleteApplicationOwnedObjects>
>[number];
type OwnedKind = OwnedObjectResult['kind'];

/** An application of a realm, with the status of its connector (`none` for every application without one). */
interface Candidate {
  record: ApplicationRecord;
  status: 'active' | 'inactive' | 'none';
  connectorId?: string;
}

/** What a preview found: whether the applications could be read, and how many of them a run would refuse. */
interface Preview {
  ok: boolean;
  refused: number;
}

/** The order in which the library deletes the owned objects: the objects an application names, the connector last. */
const OWNED_KIND_ORDER: OwnedKind[] = [
  'oauth2Client',
  'saml2Provider',
  'mapping',
  'connector',
];

const KIND_LABEL: Record<OwnedKind, string> = {
  oauth2Client: 'OAuth2 client',
  saml2Provider: 'SAML provider',
  mapping: 'mapping',
  connector: 'connector',
};

/**
 * The same application: by id where both have one, otherwise by name.
 * @param {{ applicationId?: string; applicationName: string }} owner an owner from the ownership index
 * @param {ApplicationRecord} record an application record
 * @returns {boolean} true if the owner is the application
 */
function isSameApplication(
  owner: { applicationId?: string; applicationName: string },
  record: ApplicationRecord
): boolean {
  return owner.applicationId && record._id
    ? owner.applicationId === record._id
    : owner.applicationName === record.name;
}

/**
 * The ownership index as it is once an application is gone: the application no
 * longer names anything, so an object that only it and an application that is
 * deleted later shared is deleted with the last of them.
 * @param {ApplicationOwnership} ownership the index
 * @param {ApplicationRecord} record the application that is gone
 * @returns {ApplicationOwnership} a copy of the index without the application
 */
function withoutApplication(
  ownership: ApplicationOwnership,
  record: ApplicationRecord
): ApplicationOwnership {
  return {
    entries: ownership.entries
      .map((entry) => ({
        ...entry,
        owners: entry.owners.filter(
          (owner) => !isSameApplication(owner, record)
        ),
      }))
      .filter((entry) => entry.owners.length > 0),
  };
}

/**
 * The owned objects an application record names, in the order they are deleted.
 * @param {ApplicationRecord} record the application record
 * @returns {{ kind: OwnedKind; id: string }[]} the owned references
 */
function ownedObjects(
  record: ApplicationRecord
): { kind: OwnedKind; id: string }[] {
  return frodo.app
    .getApplicationRecordReferences(record)
    .filter((reference) =>
      (OWNED_KIND_ORDER as string[]).includes(reference.kind)
    )
    .map((reference) => ({
      kind: reference.kind as OwnedKind,
      id: reference.id,
    }))
    .sort(
      (a, b) =>
        OWNED_KIND_ORDER.indexOf(a.kind) - OWNED_KIND_ORDER.indexOf(b.kind)
    );
}

/**
 * What to tell a person who has to switch an active application off first.
 * @param {Candidate} candidate the application
 * @returns {string} the reason, naming the command that is the way out
 */
function refusal(candidate: Candidate): string {
  const connector = candidate.connectorId ? ` "${candidate.connectorId}"` : '';
  return `its connector${connector} is active; switch the application off first with: frodo app disable -n "${candidate.record.name}"`;
}

/**
 * Names the other applications that still name an owned object.
 * @param {{ applicationName: string }[]} owners the other owners
 * @returns {string} the names, quoted
 */
function ownerNames(owners: { applicationName: string }[]): string {
  return owners.map((owner) => `"${owner.applicationName}"`).join(', ');
}

/**
 * Read the applications of the current realm with the status of each.
 * @param {string} name optional: only the application with this name
 * @returns {Promise<Candidate[]>} the applications, sorted by name
 */
async function readCandidates(name?: string): Promise<Candidate[]> {
  if (name) {
    const record = await frodo.app.readApplicationByName(name);
    const status = await frodo.app.readApplicationStatus(record._id);
    return [{ record, status: status.status, connectorId: status.connectorId }];
  }
  const records = await frodo.app.readApplications();
  const statuses = new Map(
    (await frodo.app.readApplicationStatuses()).map((status) => [
      status.applicationId,
      status,
    ])
  );
  return [...records]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((record) => ({
      record,
      status: statuses.get(record._id)?.status ?? 'none',
      connectorId: statuses.get(record._id)?.connectorId,
    }));
}

/**
 * The realms an application delete runs in.
 * @param {string} realm the realm of the command, if there is one
 * @returns {Promise<string[]>} the realm, or every realm of the tenant
 */
async function realmsOf(realm?: string): Promise<string[]> {
  return realm && realm !== DEFAULT_REALM_KEY ? [realm] : realmList();
}

/**
 * Whether a realm has no applications to look at: the root realm of a Cloud
 * tenant has none.
 * @param {string} realm the realm
 * @returns {boolean} true if the realm is skipped
 */
function skippedRealm(realm: string): boolean {
  return (
    realm === '/' && state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
  );
}

/**
 * Print what a delete would do to the applications of the current realm: for
 * each one whether it would be refused (its connector is active) or deleted, and
 * what happens to each object it owns. The ownership is followed in order, so an
 * object that two applications of this run share is deleted with the last of
 * them, as the run does it.
 * @param {Candidate[]} candidates the applications of the realm
 * @param {string} realmName the realm, for the lines
 * @param {() => Promise<ApplicationOwnership>} readOwnership reads the ownership of the realm, once
 * @returns {Promise<number>} how many applications a run would refuse
 */
async function printPlan(
  candidates: Candidate[],
  realmName: string,
  readOwnership: () => Promise<ApplicationOwnership>
): Promise<number> {
  let refused = 0;
  let ownership: ApplicationOwnership | undefined;
  for (const candidate of candidates) {
    const { record } = candidate;
    const head = `Dry run: application "${record.name}" in realm ${realmName}`;
    if (candidate.status === 'active') {
      refused++;
      printMessage(
        `${head} would NOT be deleted: ${refusal(candidate)}.`,
        'warn'
      );
      continue;
    }
    const objects = ownedObjects(record);
    printMessage(
      objects.length === 0
        ? `${head} would be deleted (it owns no other objects).`
        : `${head} would be deleted, with the objects it owns:`
    );
    if (objects.length > 0) ownership ??= await readOwnership();
    for (const object of objects) {
      const others = ownership
        ? frodo.app
            .getApplicationOwners(ownership, object.kind, object.id)
            .filter((owner) => !isSameApplication(owner, record))
        : [];
      printMessage(
        others.length > 0
          ? `  - ${KIND_LABEL[object.kind]} ${object.id}: kept, it is also used by application ${ownerNames(others)}`
          : `  - ${KIND_LABEL[object.kind]} ${object.id}: deleted`
      );
    }
    if (ownership) ownership = withoutApplication(ownership, record);
  }
  return refused;
}

/**
 * Look at what a delete of applications would do, without deleting anything.
 * @param {string} name optional name: only that application (needs a single realm)
 * @param {string} realm optional realm. Default: every realm (the root realm of a Cloud tenant has no applications)
 * @returns {Promise<Preview>} whether the applications could be read, and how many a run would refuse
 */
async function preview(name?: string, realm?: string): Promise<Preview> {
  try {
    const realms = await realmsOf(realm);
    if (name && realms.length !== 1) {
      printMessage(
        'Error: for a named application, specify a single realm',
        'error'
      );
      return { ok: false, refused: 0 };
    }
    let found = 0;
    let refused = 0;
    for (const currentRealm of realms) {
      if (skippedRealm(currentRealm)) continue;
      state.setRealm(currentRealm);
      let candidates: Candidate[];
      try {
        candidates = await readCandidates(name);
      } catch (error) {
        printError(
          error,
          name
            ? `Error reading application '${name}' in realm '${currentRealm}'`
            : `Error reading the applications of realm '${currentRealm}'`
        );
        return { ok: false, refused };
      }
      found += candidates.length;
      let ownership: ApplicationOwnership | undefined;
      refused += await printPlan(
        candidates,
        currentRealm,
        async () => (ownership ??= await frodo.app.readApplicationOwnership())
      );
    }
    if (found === 0) printMessage('No applications found to delete.');
    return { ok: true, refused };
  } catch (error) {
    printError(error, 'Error previewing the delete of applications.');
    return { ok: false, refused: 0 };
  }
}

/**
 * Print what a delete of applications would do, for the question that asks
 * before a bulk delete. Applications that a run would refuse are shown, and do
 * not make the plan fail.
 * @param {string} name optional name: only that application
 * @param {string} realm optional realm. Default: every realm
 * @returns {Promise<boolean>} true if the plan could be made
 */
export async function showApplicationDeletePlan(
  name?: string,
  realm?: string
): Promise<boolean> {
  return (await preview(name, realm)).ok;
}

/**
 * Delete applications the way the application is deleted in the Admin UI, one
 * application after the other (cli record 0042, slice S5 of frodo-cli#1101):
 * the application record first, then the objects it owns (the OAuth2 client, the
 * SAML providers, the mappings and the connector that its record names), never
 * the shared pieces (scripts, circles of trust) and, on tenants that have them,
 * not the glossary or the request forms. An owned object that another
 * application still names is kept. An application whose connector is active is
 * refused, naming `frodo app disable`: it is a failed operation and nothing of
 * it is deleted. The record and every owned object are one operation of the run
 * (record 0040), so one summary names what failed and the others are still done.
 * A named application that cannot be read, a name that needs a realm and a
 * realm whose applications cannot be read end the command whatever
 * `--allow-failures` says (record 0041).
 * @param {string} name optional name: delete only that application (needs a single realm)
 * @param {string} realm optional realm. Default: every realm (the root realm of a Cloud tenant has no applications)
 * @param {boolean} dryRun true to show what would be deleted and delete nothing; an application that a run would refuse is a failure of the preview too. Default: false
 * @param {boolean} allowFailures true to report operations that failed but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerDeleteApplications(
  name?: string,
  realm?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  if (dryRun) {
    const outcome = await preview(name, realm);
    if (!outcome.ok) return false;
    if (outcome.refused === 0) return true;
    const message = `${outcome.refused} application${outcome.refused === 1 ? '' : 's'} would be refused because the connector is active; a run exits with code 1 for that.`;
    if (allowFailures) {
      printMessage(
        `${message} The exit code stays 0 because --allow-failures was given.`,
        'warn'
      );
      return true;
    }
    printMessage(message, 'error');
    return false;
  }

  const run = new OperationRun({ unit: 'operation', allowFailures });
  try {
    const realms = await realmsOf(realm);
    if (name && realms.length !== 1) {
      printMessage(
        'Error: for a named application, specify a single realm',
        'error'
      );
      return false;
    }
    let found = 0;
    for (const currentRealm of realms) {
      if (skippedRealm(currentRealm)) continue;
      state.setRealm(currentRealm);
      let candidates: Candidate[];
      try {
        candidates = await readCandidates(name);
      } catch (error) {
        printError(
          error,
          name
            ? `Error reading application '${name}' in realm '${currentRealm}'`
            : `Error reading the applications of realm '${currentRealm}'`
        );
        // nothing is deleted when the applications or their status cannot be read
        run.finish();
        return false;
      }
      found += candidates.length;
      let ownership: ApplicationOwnership | undefined;
      for (const candidate of candidates) {
        const { record } = candidate;
        const label =
          realms.length > 1
            ? `application ${record.name} in realm ${currentRealm}`
            : `application ${record.name}`;
        if (candidate.status === 'active') {
          printMessage(
            `Application "${record.name}" is not deleted: ${refusal(candidate)}.`,
            'error'
          );
          run.recordFailure(label, refusal(candidate));
          continue;
        }

        const recordDeleted = await run.run(label, async () => {
          await frodo.app.deleteApplication(record._id, false);
          printMessage(
            `Deleted application "${record.name}" in realm ${currentRealm}`
          );
        });
        // the record goes first: when it stays, nothing it owns is touched
        if (!recordDeleted) continue;

        if (ownedObjects(record).length === 0) continue;
        try {
          ownership ??= await frodo.app.readApplicationOwnership();
          // the record that was read before it was deleted names the owned objects
          await frodo.app.deleteApplicationOwnedObjects(record, {
            ownership,
            resultCallback: (error, result) => {
              const object = result
                ? `${KIND_LABEL[result.kind]} ${result.id}`
                : 'an owned object';
              if (error) {
                printError(error, `Failed to delete ${object}`);
                run.recordFailure(`${label}: ${object}`, error);
                return;
              }
              if (result?.outcome === 'kept') {
                printMessage(
                  `Kept ${object}: it is also used by application ${ownerNames(result.owners ?? [])}`
                );
              } else {
                printMessage(`Deleted ${object}`);
              }
              run.recordSuccess();
            },
          });
        } catch (error) {
          // the ownership could not be read: the record is gone, the objects are not touched
          printError(
            error,
            `The objects owned by application "${record.name}" were not deleted`
          );
          run.recordFailure(`${label}: the objects it owns`, causeOf(error));
        }
        // a later application of this run no longer shares anything with this one
        if (ownership) ownership = withoutApplication(ownership, record);
      }
    }
    if (found === 0) printMessage('No applications found to delete.');
    return run.finish();
  } catch (error) {
    printError(error, 'Error deleting applications.');
    run.finish();
    return false;
  }
}
