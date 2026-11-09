import { frodo, state } from '@rockcarver/frodo-lib';
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

/**
 * The ownership of the realms a pull works in: which application owns which
 * OAuth2 client, SAML provider, connector and mapping. The ownership of a realm
 * is read once, however many objects ask.
 */
export class OwnedObjects {
  private readonly realms = new Map<string, Ownership>();

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
 * The line that says why an object was not pulled by a standalone kind.
 * @param {OwnedKind} kind what kind of object it is
 * @param {string} id the id or name of the object
 * @param {OwnedBy[]} owners the applications that own it (at least one)
 * @param {boolean} withRealm true to name the realm of each owner, for the objects that belong to no realm
 * @returns {string} the message
 */
export function ownedObjectMessage(
  kind: OwnedKind,
  id: string,
  owners: OwnedBy[],
  withRealm: boolean = false
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
  return `${KIND_LABEL[kind]} ${id} is owned by ${who} and is pulled by "pull applications".`;
}
