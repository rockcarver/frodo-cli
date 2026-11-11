/**
 * The config-manager kind `trusted-jwt-issuers`: OAuth2 trusted JWT issuers (the agent type
 * `TrustedJwtIssuer`: the issuers whose signed JWTs an OAuth 2.0 provider accepts as grants, a trust
 * anchor) as files of the fr-config-manager tree,
 * `realms/<realm>/realm-config/agents/TrustedJwtIssuer/<id>.json`.
 *
 * This module is in `src/ops` and not in the deprecated `src/configManagerOps/` layer (decision
 * records 0023, 0024 and 0042; see {@link ./ConfigManagerAgentKind}). The rules that every kind of
 * the family follows are in that module; what is specific to issuers is here:
 * - the type exists on every deployment, so there is no availability check: a realm that cannot be
 *   read is a failed realm;
 * - the file is the object that `pull oauth2-agents` writes today, byte for byte, so that no
 *   existing tree changes: the single read of the issuer (every property wrapped as
 *   `{ inherited, value }`), not the list read;
 * - an issuer is a trust anchor: a `jwkSet` that holds private or secret key material is written
 *   (the user asked for the issuer) with a warning that never prints the key, and a push says what
 *   it replaces and never deletes.
 */
import {
  frodo,
  type FrodoError,
  type OAuth2TrustedJwtIssuerExportInterface,
  type OAuth2TrustedJwtIssuerSkeleton,
} from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import {
  agentKindFilePath,
  pullAgentKind,
  pushAgentKind,
  type AgentKindSpec,
  type PulledItem,
} from './ConfigManagerAgentKind';

const { issuer } = frodo.oauth2oidc;

/** The agent type of a trusted JWT issuer, which names the folder of its files. */
export const TRUSTED_JWT_ISSUER_AGENT_TYPE = 'TrustedJwtIssuer';

/** The name of the kind, which is the name of its commands. */
export const TRUSTED_JWT_ISSUERS_KIND = 'trusted-jwt-issuers';

/** What the kind is called in its messages. */
export const TRUSTED_JWT_ISSUER_KIND: AgentKindSpec = {
  agentType: TRUSTED_JWT_ISSUER_AGENT_TYPE,
  label: 'trusted JWT issuer',
  plural: 'trusted JWT issuers',
};

/**
 * The path of the file of a trusted JWT issuer, relative to the working directory.
 * @param {string} realm the realm, as the state names it
 * @param {string} fileName the file name without the extension
 * @returns {string} `realms/<realm or root>/realm-config/agents/TrustedJwtIssuer/<fileName>.json`
 */
export const trustedJwtIssuerFilePath = (
  realm: string,
  fileName: string
): string => agentKindFilePath(TRUSTED_JWT_ISSUER_AGENT_TYPE, realm, fileName);

/** The members of a JWK that only a private or a symmetric key has. */
const SECRET_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'];

/**
 * Whether the `jwkSet` of an issuer holds private or secret key material: a JWK with a private or a
 * symmetric member. The value may be wrapped (`{ inherited, value }`), and is a string of JSON.
 * Nothing of the key is returned or printed.
 * @param {unknown} jwkSet the `jwkSet` property of the issuer
 * @returns {boolean} true if a key in it is private or symmetric
 */
export function holdsSecretKeyMaterial(jwkSet: unknown): boolean {
  let value: unknown = jwkSet;
  if (value && typeof value === 'object' && 'value' in value) {
    value = (value as { value: unknown }).value;
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return false;
    }
  }
  if (!value || typeof value !== 'object') return false;
  const keys = Array.isArray((value as { keys?: unknown }).keys)
    ? ((value as { keys: unknown[] }).keys as unknown[])
    : [value];
  return keys.some(
    (key) =>
      key &&
      typeof key === 'object' &&
      SECRET_JWK_MEMBERS.some((member) => member in (key as object))
  );
}

/**
 * Export the trusted JWT issuers of every realm (or one realm, or one issuer) as one file per
 * issuer. The content is the single read of the issuer, the object that `pull oauth2-agents`
 * writes, so that a tree that has issuers does not change; the issuers are listed once per realm
 * and read one by one (there are few). With a name the list is not read: the issuer is read by its
 * name (the name of the object, not its `iss` URL), and an issuer that does not exist fails.
 *
 * Every issuer is one operation of an {@link OperationRun}: an issuer that cannot be read or
 * written, and a realm whose issuers cannot be listed, are named in one summary and the others are
 * still pulled. A named issuer that does not exist, a name without a single realm and an
 * overrides file that cannot be read fail the command whatever `--allow-failures` says. A `jwkSet`
 * with private or secret key material is a warning, not a failure, and the key is never printed.
 * @param {string} name optional name: pull only that issuer (needs a single realm)
 * @param {string} realm optional realm: pull only from that realm. Default: every realm (the root realm of a Cloud tenant has no trusted JWT issuers)
 * @param {boolean} quiet true for the step of `pull all`: say nothing when there is nothing to export
 * @param {boolean} allowFailures true to report issuers that could not be pulled but still succeed. Default: false
 * @param {string | null} overridesFile optional JSON file with `{ "<realm>": [ { "id": "<issuer>", "overrides": { ... } } ] }`, for values that differ between environments
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportTrustedJwtIssuers(
  name?: string,
  realm?: string,
  quiet: boolean = false,
  allowFailures: boolean = false,
  overridesFile?: string | null
): Promise<boolean> {
  return pullAgentKind(
    TRUSTED_JWT_ISSUER_KIND,
    {
      items: async (wanted?: string): Promise<PulledItem[]> => {
        const ids = wanted
          ? [wanted]
          : (await issuer.readOAuth2TrustedJwtIssuers()).map(
              (item) => item._id
            );
        return ids.map((id) => ({
          id,
          read: async () =>
            (await issuer.readOAuth2TrustedJwtIssuer(id)) as unknown as Record<
              string,
              unknown
            >,
        }));
      },
      inspect: (currentRealm, id, object) => {
        if (holdsSecretKeyMaterial(object.jwkSet)) {
          printMessage(
            `Trusted JWT issuer '${id}' of realm '${currentRealm}' stores private or secret key material in jwkSet; the file contains it. Replace it with a placeholder in the overrides file.`,
            'warn'
          );
        }
      },
    },
    { name, realm, quiet, allowFailures, overridesFile }
  );
}

/**
 * Import the trusted JWT issuers of the files `realms/<realm>/realm-config/agents/TrustedJwtIssuer/<name>.json`
 * (what `pull trusted-jwt-issuers` and `pull oauth2-agents` write) into the realms they are in: an
 * issuer that does not exist is created and one that does is replaced by the file. An issuer is a
 * trust anchor (a JWT signed by it is accepted as a grant), so a pull request that changes a file
 * changes who may obtain tokens after the next push: read the files before pushing them. Nothing
 * is ever deleted. The id is the `_id` of the file, otherwise its name; `${NAME}` is filled from
 * the environment; a file of another `_type` is refused before anything is sent for it, and a file
 * without `_type` is accepted.
 *
 * The server completes an object it creates with its defaults, so an issuer that did not exist is
 * written a second time to make the tenant equal to the file (the library does this for CIMD
 * profiles itself, not yet for issuers); if that second write fails the issuer is a failure that
 * says it was created. The library retries a write that the server refuses for an unknown
 * attribute without that attribute, prints a warning of its own when it does, and no longer
 * changes the object it was given. The type exists on every deployment, so there is no check of
 * availability. See {@link pushAgentKind} for how files, failures and the name work.
 * @param {string} name optional name: push only the file of that issuer (needs a single realm)
 * @param {string} realm optional realm: push only that realm. Default: every realm folder of the tree (the root realm of a Cloud tenant has no trusted JWT issuers)
 * @param {boolean} allowFailures true to report issuers that could not be pushed but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportTrustedJwtIssuers(
  name?: string,
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  return pushAgentKind(
    TRUSTED_JWT_ISSUER_KIND,
    {
      refuse: ({ body }) => {
        const type = (body._type as { _id?: unknown } | undefined)?._id;
        return type !== undefined && type !== TRUSTED_JWT_ISSUER_AGENT_TYPE
          ? `its _type is '${String(type)}', not '${TRUSTED_JWT_ISSUER_AGENT_TYPE}'`
          : undefined;
      },
      importRealm: async (items, { realmDir, run }) => {
        // the server completes what it creates, so the ones that do not exist yet are written twice
        const existing = new Set(
          (await issuer.readOAuth2TrustedJwtIssuers()).map((item) =>
            item._id.toLowerCase()
          )
        );
        const importData: OAuth2TrustedJwtIssuerExportInterface = {
          trustedJwtIssuer: {},
        };
        const bodies = new Map<string, Record<string, unknown>>();
        for (const { id, body } of items) {
          importData.trustedJwtIssuer[id] =
            body as unknown as OAuth2TrustedJwtIssuerSkeleton;
          bodies.set(id, body);
        }
        // the library reports the issuers in the order of the keys, which is not always the order of the files
        const ids = Object.keys(importData.trustedJwtIssuer);
        let position = 0;
        const created: string[] = [];
        await issuer.importOAuth2TrustedJwtIssuers(
          importData,
          undefined,
          (error?: FrodoError): void => {
            const id = ids[position++];
            if (error) {
              printError(error);
              run.recordFailure(`${realmDir}/${id}`, causeOf(error));
            } else if (existing.has(id.toLowerCase())) {
              run.recordSuccess();
            } else {
              created.push(id);
            }
          }
        );
        for (const id of created) {
          const label = `${realmDir}/${id}`;
          try {
            const body = structuredClone(bodies.get(id)) as Record<
              string,
              unknown
            >;
            delete body._provider;
            delete body._rev;
            await issuer.updateOAuth2TrustedJwtIssuer(
              id,
              body as unknown as OAuth2TrustedJwtIssuerSkeleton
            );
            run.recordSuccess();
          } catch (error) {
            printError(error);
            run.recordFailure(
              label,
              `created, but the second write that makes it equal to the file failed: ${causeOf(error)}`
            );
          }
        }
      },
    },
    { name, realm, allowFailures }
  );
}
