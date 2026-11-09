import fs from 'fs';
import path from 'path';
import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { realmList } from '../utils/FrConfig';
import {
  readTreeLayout,
  type ApplicationLayoutDecision,
} from '../utils/TreeLayout';

const { getWorkingDirectory } = frodo.utils;
const { CLOUD_DEPLOYMENT_TYPE_KEY, FORGEOPS_DEPLOYMENT_TYPE_KEY } =
  frodo.utils.constants;

/** The kinds of object an application owns, as the library's ownership index names them. */
export type OwnedKind = Parameters<typeof frodo.app.getApplicationOwners>[1];

type Ownership = Awaited<ReturnType<typeof frodo.app.readApplicationOwnership>>;

type ApplicationRecords = Parameters<
  typeof frodo.app.getApplicationOwnership
>[0];

/** An application that owns an object, with the realm it lives in. */
export interface OwnedBy {
  realm: string;
  applicationName: string;
}

const KIND_LABEL: Record<OwnedKind, string> = {
  oauth2Client: 'OAuth2 client',
  saml2Provider: 'SAML provider',
  connector: 'connector',
  mapping: 'mapping',
};

/**
 * Whether the standalone pull kinds (`oauth2-agents`, `saml`,
 * `connector-definitions`, `connector-mappings`) leave out what an application
 * owns (decision record 0042): only in a tree that uses the application layout.
 * `pull all` decides the layout of the tree once, before its first step, and
 * hands the decision to the steps; any other command reads the marker of the
 * tree. A tree without a marker, or with the `kind-paths` layout, is left as it
 * is, and so is a deployment that has no applications.
 * @param {ApplicationLayoutDecision} layout the decision of `pull all`, if there is one
 * @returns {boolean} true if what an application owns is left out
 * @throws {FrodoError} if the marker of the tree cannot be read
 */
export function skipsOwnedObjects(layout?: ApplicationLayoutDecision): boolean {
  const deployment = state.getDeploymentType();
  if (
    deployment !== CLOUD_DEPLOYMENT_TYPE_KEY &&
    deployment !== FORGEOPS_DEPLOYMENT_TYPE_KEY
  ) {
    return false;
  }
  return layout
    ? layout.layout === 'folders'
    : readTreeLayout(getWorkingDirectory()) === 'folders';
}

/** The realm of the state that a realm folder of a tree stands for (`root` is the root realm). */
const realmOfFolder = (folder: string): string =>
  folder === 'root' ? '/' : folder;

/** The realm folder of a tree that a realm of the state is kept in. */
const folderOfRealm = (realm: string): string =>
  realm === '/' ? 'root' : realm;

function isDirectory(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * What an object that a push is about to import is called, read from its file without resolving
 * placeholders, so that the push can ask which application owns it before it reads the file. If
 * the file cannot be read, or does not name the object, the name the file is kept under stands in:
 * the push reads the file again and reports it as it always has.
 * @param {string} file the file
 * @param {(content: any) => unknown} pick takes the parsed content (undefined if the file cannot be parsed) and returns the name
 * @param {string} fallback the name to use if the file does not give one
 * @returns {string} the id or name of the object
 */
export function objectNameInFile(
  file: string,
  pick: (content: any) => unknown,
  fallback: string
): string {
  try {
    const name = pick(JSON.parse(fs.readFileSync(file, 'utf8')));
    return typeof name === 'string' && name !== '' ? name : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The application records of one realm folder of a tree: every
 * `realms/<realm>/applications/<folder>/application.json`, as `pull applications`
 * writes it. A folder whose record cannot be read, is not a JSON object or has
 * no name is a problem, not a record: what it owns cannot be known.
 * @param {string} treeDir the root of the tree
 * @param {string} realmFolder the realm folder: `root`, or the name of the realm
 * @returns {{ records: ApplicationRecords; problems: string[] }} the records, and one line for each folder that has none
 */
function readApplicationRecordsOfFolder(
  treeDir: string,
  realmFolder: string
): { records: ApplicationRecords; problems: string[] } {
  const records: ApplicationRecords = [];
  const problems: string[] = [];
  const applicationsDir = path.join(
    treeDir,
    'realms',
    realmFolder,
    'applications'
  );
  if (!isDirectory(applicationsDir)) return { records, problems };
  const folders = fs
    .readdirSync(applicationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const folder of folders) {
    const where = `realms/${realmFolder}/applications/${folder}`;
    try {
      const record = JSON.parse(
        fs.readFileSync(
          path.join(applicationsDir, folder, 'application.json'),
          'utf8'
        )
      );
      if (
        typeof record !== 'object' ||
        record === null ||
        Array.isArray(record) ||
        typeof record.name !== 'string' ||
        record.name === ''
      ) {
        throw new Error('application.json has no application name');
      }
      records.push(record);
    } catch (error) {
      const reason =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'the folder has no application.json'
          : String((error as Error).message).split('\n')[0];
      problems.push(`${where} (${reason})`);
    }
  }
  return { records, problems };
}

/**
 * The ownership of the realms a pull or a push works in: which application owns
 * which OAuth2 client, SAML provider, connector and mapping. A pull reads it
 * from the tenant, a push from the application folders of the tree. The
 * ownership of a realm is read once, however many objects ask.
 */
export class OwnedObjects {
  private readonly realms = new Map<string, Ownership | undefined>();

  /**
   * Read the ownership of the realm that the state is set to, unless it has been read.
   * @throws {FrodoError} if the applications of the realm cannot be read
   */
  async loadCurrentRealm(): Promise<void> {
    const realm = state.getRealm();
    if (!this.realms.has(realm)) {
      this.realms.set(realm, await frodo.app.readApplicationOwnership());
    }
  }

  /**
   * Read the ownership of every realm that can have applications, for the
   * objects that belong to no realm (connectors and mappings are IDM
   * configuration of the whole tenant). The realm of the state is restored.
   * @throws {FrodoError} if the applications of a realm cannot be read
   */
  async loadAllRealms(): Promise<void> {
    const previous = state.getRealm();
    try {
      for (const realm of await realmList()) {
        if (
          realm === '/' &&
          state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
        ) {
          continue;
        }
        state.setRealm(realm);
        await this.loadCurrentRealm();
      }
    } finally {
      state.setRealm(previous);
    }
  }

  /**
   * Read the ownership of one realm from the application folders of a tree
   * (`realms/<realm>/applications/<folder>/application.json`), unless it has
   * been read. Nothing is asked of the tenant: the records the tree holds
   * name what each application owns.
   * @param {string} treeDir the root of the tree
   * @param {string} realm the realm, as the state names it (`/` is read from the folder `root`)
   * @throws {FrodoError} naming every application folder of the realm whose record cannot be read
   */
  loadRealmOfTree(treeDir: string, realm: string): void {
    if (this.realms.has(realm)) return;
    const { records, problems } = readApplicationRecordsOfFolder(
      treeDir,
      folderOfRealm(realm)
    );
    if (problems.length > 0) {
      throw new FrodoError(
        `Cannot read the application folders of realm '${realm}': ${problems.join('; ')}`
      );
    }
    this.realms.set(
      realm,
      records.length > 0
        ? frodo.app.getApplicationOwnership(records)
        : undefined
    );
  }

  /**
   * Read the ownership of every realm folder of a tree that has applications,
   * for the objects that belong to no realm (connectors and mappings). The
   * root realm of a Cloud tenant has no applications and is not read.
   * @param {string} treeDir the root of the tree
   * @throws {FrodoError} naming every application folder, of any realm, whose record cannot be read
   */
  loadAllRealmsOfTree(treeDir: string): void {
    const realmsDir = path.join(treeDir, 'realms');
    if (!isDirectory(realmsDir)) return;
    const problems: string[] = [];
    for (const folder of fs
      .readdirSync(realmsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      const realm = realmOfFolder(folder);
      if (
        realm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        continue;
      }
      if (this.realms.has(realm)) continue;
      const read = readApplicationRecordsOfFolder(treeDir, folder);
      problems.push(...read.problems);
      this.realms.set(
        realm,
        read.problems.length === 0 && read.records.length > 0
          ? frodo.app.getApplicationOwnership(read.records)
          : undefined
      );
    }
    if (problems.length > 0) {
      throw new FrodoError(
        `Cannot read the application folders of the tree: ${problems.join('; ')}`
      );
    }
  }

  /**
   * The applications of the current realm that own an object. The realm must have been loaded.
   * @param {OwnedKind} kind what kind of object it is
   * @param {string} id the OAuth2 client id, the SAML entity id (decoded), the connector name or the mapping name
   * @returns {OwnedBy[]} the owners, empty if no application owns it
   */
  ownersInCurrentRealm(kind: OwnedKind, id: string): OwnedBy[] {
    const realm = state.getRealm();
    return this.ownersIn(realm, this.realms.get(realm), kind, id);
  }

  /**
   * The applications of any loaded realm that own an object.
   * @param {OwnedKind} kind what kind of object it is
   * @param {string} id the connector name or the mapping name
   * @returns {OwnedBy[]} the owners, empty if no application owns it
   */
  ownersInAnyRealm(kind: OwnedKind, id: string): OwnedBy[] {
    return [...this.realms.entries()].flatMap(([realm, ownership]) =>
      this.ownersIn(realm, ownership, kind, id)
    );
  }

  private ownersIn(
    realm: string,
    ownership: Ownership | undefined,
    kind: OwnedKind,
    id: string
  ): OwnedBy[] {
    if (!ownership) return [];
    return frodo.app
      .getApplicationOwners(ownership, kind, id)
      .map((owner) => ({ realm, applicationName: owner.applicationName }));
  }
}

/**
 * The line that says why an object was not pulled or pushed by a standalone kind.
 * @param {OwnedKind} kind what kind of object it is
 * @param {string} id the id or name of the object
 * @param {OwnedBy[]} owners the applications that own it (at least one)
 * @param {boolean} withRealm true to name the realm of each owner, for the objects that belong to no realm
 * @param {'pulled' | 'pushed'} direction whether a pull or a push left the object out. Default: 'pulled'
 * @returns {string} the message
 */
export function ownedObjectMessage(
  kind: OwnedKind,
  id: string,
  owners: OwnedBy[],
  withRealm: boolean = false,
  direction: 'pulled' | 'pushed' = 'pulled'
): string {
  const names = owners.map((owner) =>
    withRealm
      ? `"${owner.applicationName}" (realm ${owner.realm})`
      : `"${owner.applicationName}"`
  );
  const who =
    names.length === 1
      ? `application ${names[0]}`
      : `applications ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const command = direction === 'pulled' ? 'pull' : 'push';
  return `${KIND_LABEL[kind]} ${id} is owned by ${who} and is ${direction} by "${command} applications".`;
}
