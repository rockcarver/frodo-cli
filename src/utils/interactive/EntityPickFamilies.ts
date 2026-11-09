/**
 * Registers the families. Called once when the commands are set up;
 * registering again replaces the entries.
 */

/**
 * The command families that have a registered entity picker (decision record
 * 0038). One entry says how to list the entities of a family; every command
 * of the family that has the option gets the picker from the framework
 * (EntityPickRegistry.ts, resolved after login by `getTokens`).
 *
 * To give a family its pickers, add an entry here. Nothing changes in the
 * command files.
 */
import {
  frodo,
  state,
  type PolicySetSkeleton,
  type PolicySkeleton,
  type RemoteProxySkeleton,
  type ResourceTypeSkeleton,
  type WorkflowGroup,
} from '@rockcarver/frodo-lib';
import {
  sameHost,
  savedConnectionProfiles,
  type SavedProfile,
} from '../SavedProfiles';
import { entityPick } from './EntityPickers';
import { registerEntityPickFamily } from './EntityPickRegistry';

const REMOTE_PROXY_ID_PREFIX = 'external.idm/';

/** The name of a remote proxy: its configuration id without the type prefix. */
function remoteProxyName(proxy: RemoteProxySkeleton): string {
  return (proxy._id ?? '').slice(REMOTE_PROXY_ID_PREFIX.length);
}

/** The resource types of the realm, by name. */
async function readResourceTypesByName(): Promise<ResourceTypeSkeleton[]> {
  return (await frodo.authz.resourceType.readResourceTypes()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/** The workflow a group stands for: the published one, else the draft. */
function workflowOf(group: WorkflowGroup) {
  return group.published ?? group.draft;
}

type OAuth2Client = Awaited<
  ReturnType<typeof frodo.oauth2oidc.client.readOAuth2Clients>
>[number];

type AdminFederationProvider = Awaited<
  ReturnType<typeof frodo.cloud.adminFed.readAdminFederationProviders>
>[number];

type IdmFeature = Awaited<
  ReturnType<typeof frodo.cloud.idmFeature.readIdmFeatures>
>[number];

type ConfigEntity = Awaited<
  ReturnType<typeof frodo.idm.config.readConfigEntities>
>[number];

type Mapping = Awaited<
  ReturnType<typeof frodo.idm.mapping.readMappings>
>[number];

type Server = Awaited<ReturnType<typeof frodo.server.readServers>>[number];

export function registerEntityPickFamilies(): void {
  // The agents (`frodo agent`). Each type has a group of its own and an entry of
  // its own, so the generic entry leaves the typed groups out: a command would
  // inherit two pickers for -i otherwise. `describe` takes -i as optional (without
  // it every agent is described), so it gets no picker (record 0030). `export` of
  // the generic group stays out: its -g is an alternative to -i that does not
  // conflict with it, and the framework cannot yet tell that -g already answers
  // the question (cli#1081).
  type AgentSkeleton = Awaited<
    ReturnType<typeof frodo.agent.readAgents>
  >[number];

  const byAgentId = (a: AgentSkeleton, b: AgentSkeleton) =>
    (a._id ?? '').localeCompare(b._id ?? '');

  const typedAgents = [
    {
      group: 'ai',
      kind: 'AI agent',
      read: () => frodo.agent.readAIAgents(),
    },
    {
      group: 'gateway',
      kind: 'identity gateway agent',
      read: () => frodo.agent.readIdentityGatewayAgents(),
    },
    {
      group: 'java',
      kind: 'Java agent',
      read: () => frodo.agent.readJavaAgents(),
    },
    {
      group: 'web',
      kind: 'web agent',
      read: () => frodo.agent.readWebAgents(),
    },
  ];

  registerEntityPickFamily({
    family: 'agent',
    name: 'agent: agents of every type',
    except: [
      'describe',
      'export',
      ...typedAgents.flatMap(({ group }) =>
        ['delete', 'describe', 'export'].map((verb) => `${group} ${verb}`)
      ),
    ],
    picks: [
      entityPick<AgentSkeleton>({
        name: 'agentId',
        kind: 'agent',
        load: async () => (await frodo.agent.readAgents(false)).sort(byAgentId),
        label: (agent) => agent._id ?? '',
        description: (agent) => agent._type?.name,
      }),
    ],
  });

  for (const { group, kind, read } of typedAgents) {
    registerEntityPickFamily({
      family: `agent ${group}`,
      except: ['describe'],
      picks: [
        entityPick<AgentSkeleton>({
          name: 'agentId',
          kind,
          load: async () => (await read()).sort(byAgentId),
          label: (agent) => agent._id ?? '',
        }),
      ],
    });
  }

  // The receiving tenant of `setup` and `teardown`: one of the saved connection
  // profiles, other than the tenant the command is logged in to. It is its own
  // entry because the entry below leaves `setup` out.
  registerEntityPickFamily({
    family: 'idm remote-proxy',
    name: 'idm remote-proxy: connection profiles',
    picks: [
      entityPick<SavedProfile>({
        name: 'target',
        kind: 'connection profile',
        message: 'Select the receiving tenant:',
        load: async () =>
          savedConnectionProfiles().filter(
            (profile) => !sameHost(profile.host, state.getHost() ?? '')
          ),
        label: (profile) =>
          profile.alias ? `${profile.host} (${profile.alias})` : profile.host,
        value: (profile) => profile.host,
        search: (profile, query) =>
          `${profile.host} ${profile.alias ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      }),
    ],
  });

  registerEntityPickFamily({
    family: 'idm remote-proxy',
    // `setup` names a new proxy (create and import are left out by default)
    except: ['setup'],
    picks: [
      entityPick<RemoteProxySkeleton>({
        name: 'proxyId',
        kind: 'remote proxy',
        load: async () =>
          (await frodo.idm.remoteProxy.readRemoteProxies())
            // a name the commands cannot address would only fail after the pick
            .filter((proxy) =>
              frodo.idm.remoteProxy.isValidRemoteProxyName(
                remoteProxyName(proxy)
              )
            )
            .sort((a, b) =>
              remoteProxyName(a).localeCompare(remoteProxyName(b))
            ),
        label: remoteProxyName,
        description: (proxy) =>
          [proxy.authType, proxy.instanceUrl].filter(Boolean).join(' · '),
      }),
    ],
  });

  // Authorization policies: the policy that `-i` names. `--set-id` of `delete`
  // and `export` is not offered a pick: it narrows `-a` to one policy set, so a
  // pick would open on a complete command line such as `delete -a` (record
  // 0030). `import` takes its option from a file (see `NEW_ENTITY_VERBS`).
  registerEntityPickFamily({
    family: 'authz policy',
    picks: [
      entityPick<PolicySkeleton>({
        name: 'policyId',
        kind: 'authorization policy',
        load: async () =>
          (await frodo.authz.policy.readPolicies()).sort((a, b) =>
            (a.name || a._id || '').localeCompare(b.name || b._id || '')
          ),
        label: (policy) => policy.name || policy._id || '',
        description: (policy) =>
          policy.applicationName
            ? `policy set ${policy.applicationName}`
            : undefined,
      }),
    ],
  });

  // Authorization policy sets: the set that `-i` names.
  registerEntityPickFamily({
    family: 'authz set',
    picks: [
      entityPick<PolicySetSkeleton>({
        name: 'setId',
        kind: 'policy set',
        load: async () =>
          (await frodo.authz.policySet.readPolicySets()).sort((a, b) =>
            a.name.localeCompare(b.name)
          ),
        label: (policySet) => policySet.name,
      }),
    ],
  });

  // Authorization resource types, named by `-n` or addressed by `-i`. The two
  // options exclude each other, so the pick that comes first fills one of them
  // and the other is not offered: the name comes first because it is what a
  // person reads, and the uuid is the row's description.
  registerEntityPickFamily({
    family: 'authz type',
    picks: [
      entityPick<ResourceTypeSkeleton>({
        name: 'typeName',
        kind: 'resource type',
        load: readResourceTypesByName,
        label: (type) => type.name,
        description: (type) => type.uuid,
      }),
      entityPick<ResourceTypeSkeleton>({
        name: 'typeId',
        kind: 'resource type',
        load: readResourceTypesByName,
        label: (type) => type.name,
        value: (type) => type.uuid,
        description: (type) => type.uuid,
      }),
    ],
  });

  // IGA workflows: the workflow that `-i` names. `describe` is left out: it
  // takes `-i` together with `-f` (the workflow inside a file), so a complete
  // command line can lack `-i` and a pick must not open on it (record 0030).
  // A tenant without IGA has no workflows to offer: the commands say so
  // themselves once the pick is satisfied.
  registerEntityPickFamily({
    family: 'iga workflow',
    except: ['describe'],
    picks: [
      entityPick<WorkflowGroup>({
        name: 'workflowId',
        kind: 'workflow',
        load: async () =>
          state.getIsIGA()
            ? (await frodo.cloud.iga.workflow.readWorkflowGroups()).sort(
                (a, b) => workflowOf(a).id.localeCompare(workflowOf(b).id)
              )
            : [],
        label: (group) => workflowOf(group).id,
        description: (group) => workflowOf(group).name,
      }),
    ],
  });

  // The OAuth2 client a command acts as (`--client-id` of `get-access-token`
  // and `execute-rfc7523-authz-grant-flow`). Left out are the commands whose
  // `--client-id` is optional, or names a client that does not exist yet.
  registerEntityPickFamily({
    family: 'admin',
    except: [
      'create-oauth2-client-with-admin-privileges',
      'generate-rfc7523-authz-grant-artefacts',
      'grant-oauth2-client-admin-privileges',
      'revoke-oauth2-client-admin-privileges',
    ],
    picks: [
      entityPick<OAuth2Client>({
        name: 'clientId',
        kind: 'OAuth2 client',
        load: async () =>
          (await frodo.oauth2oidc.client.readOAuth2Clients()).sort((a, b) =>
            (a._id ?? '').localeCompare(b._id ?? '')
          ),
        label: (client) => client._id ?? '',
      }),
    ],
  });

  registerEntityPickFamily({
    family: 'admin federation',
    picks: [
      entityPick<AdminFederationProvider>({
        name: 'idpId',
        kind: 'admin federation provider',
        load: async () =>
          (await frodo.cloud.adminFed.readAdminFederationProviders()).sort(
            (a, b) => a._id.localeCompare(b._id)
          ),
        label: (provider) => provider._id,
      }),
    ],
  });

  registerEntityPickFamily({
    family: 'feature',
    picks: [
      entityPick<IdmFeature>({
        name: 'featureId',
        kind: 'feature',
        load: async () =>
          (await frodo.cloud.idmFeature.readIdmFeatures()).sort((a, b) =>
            (a._id ?? '').localeCompare(b._id ?? '')
          ),
        label: (feature) => feature._id ?? '',
        description: (feature) =>
          feature.installedVersion
            ? `installed ${feature.installedVersion}`
            : 'not installed',
      }),
    ],
  });

  // The configuration entities of the tenant: `export -i` and `delete -i`
  // (`import` takes its entity from a file and is left out by default).
  registerEntityPickFamily({
    family: 'idm',
    picks: [
      entityPick<ConfigEntity>({
        name: 'entityId',
        kind: 'config entity',
        load: () => frodo.idm.config.readConfigEntities(),
        label: (entity) => entity._id ?? '',
      }),
      entityPick<ConfigEntity>({
        name: 'id',
        kind: 'config entity',
        load: () => frodo.idm.config.readConfigEntities(),
        label: (entity) => entity._id ?? '',
      }),
    ],
  });

  // `mapping delete` keeps its own pick: it narrows the list by `-c` and `-t`,
  // which a family loader cannot read.
  registerEntityPickFamily({
    family: 'mapping',
    picks: [
      entityPick<Mapping>({
        name: 'mappingId',
        kind: 'mapping',
        load: async () =>
          (await frodo.idm.mapping.readMappings()).sort((a, b) =>
            (a.displayName || a.name || '').localeCompare(
              b.displayName || b.name || ''
            )
          ),
        label: (mapping) => mapping.displayName || mapping.name,
        // the commands take the id of the mapping: `mapping/<name>` or `sync/<name>`
        value: (mapping) => mapping._id ?? '',
        description: (mapping) => mapping._id ?? '',
      }),
    ],
  });

  registerEntityPickFamily({
    family: 'server',
    picks: [
      entityPick<Server>({
        name: 'serverId',
        kind: 'server',
        load: async () =>
          (await frodo.server.readServers()).sort((a, b) =>
            (a._id ?? '').localeCompare(b._id ?? '')
          ),
        label: (server) => server._id ?? '',
        description: (server) =>
          [server.url, server.siteName].filter(Boolean).join(' · '),
      }),
    ],
  });

  // `app`: the applications of the realm. `-i` takes the id, `-n` the name;
  // the picker shows the name either way. An `app` command that takes an
  // application by `-i, --app-id` or `-n, --app-name` inherits both picks.
  type Application = Awaited<
    ReturnType<typeof frodo.app.readApplications>
  >[number];

  const applications = async () =>
    (await frodo.app.readApplications()).sort((a, b) =>
      (a.name || a._id || '').localeCompare(b.name || b._id || '')
    );

  registerEntityPickFamily({
    family: 'app',
    picks: [
      entityPick<Application>({
        name: 'appId',
        kind: 'application',
        load: applications,
        label: (application) => application.name || application._id || '',
        value: (application) => application._id ?? '',
        description: (application) => application.description,
        search: (application, query) =>
          `${application.name ?? ''} ${application._id ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      }),
      entityPick<Application>({
        name: 'appName',
        kind: 'application',
        load: applications,
        label: (application) => application.name || application._id || '',
        description: (application) => application.description,
      }),
    ],
  });

  // `idp`: the social identity providers of the realm, by id.
  type SocialIdp = Awaited<
    ReturnType<typeof frodo.oauth2oidc.external.readSocialIdentityProviders>
  >[number];

  registerEntityPickFamily({
    family: 'idp',
    picks: [
      entityPick<SocialIdp>({
        name: 'idpId',
        kind: 'identity provider',
        load: async () =>
          (await frodo.oauth2oidc.external.readSocialIdentityProviders()).sort(
            (a, b) => (a._id ?? '').localeCompare(b._id ?? '')
          ),
        label: (idp) => idp._id ?? '',
      }),
    ],
  });

  // `oauth client`: the OAuth2 clients of the realm, by client id.

  registerEntityPickFamily({
    family: 'oauth client',
    picks: [
      entityPick<OAuth2Client>({
        name: 'appId',
        kind: 'OAuth2 client',
        load: async () =>
          (await frodo.oauth2oidc.client.readOAuth2Clients()).sort((a, b) =>
            (a._id ?? '').localeCompare(b._id ?? '')
          ),
        label: (client) => client._id ?? '',
      }),
    ],
  });

  // `realm`: the realms of the tenant. `-i` takes the id, `-n` the name; the
  // picker shows the name either way.
  type Realm = Awaited<ReturnType<typeof frodo.realm.readRealms>>[number];

  const realms = async () =>
    (await frodo.realm.readRealms()).sort((a, b) =>
      (a.name || a._id || '').localeCompare(b.name || b._id || '')
    );

  registerEntityPickFamily({
    family: 'realm',
    picks: [
      entityPick<Realm>({
        name: 'realmId',
        kind: 'realm',
        load: realms,
        label: (realm) => realm.name || realm._id || '',
        value: (realm) => realm._id ?? '',
        description: (realm) => realm._id,
        search: (realm, query) =>
          `${realm.name ?? ''} ${realm._id ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      }),
      entityPick<Realm>({
        name: 'realmName',
        kind: 'realm',
        load: realms,
        label: (realm) => realm.name || realm._id || '',
        description: (realm) => realm._id,
      }),
    ],
  });

  // `role`: the internal roles. `-i` takes the id, `-n` the name; the picker
  // shows the name either way.
  type InternalRole = Awaited<
    ReturnType<typeof frodo.role.readInternalRoles>
  >[number];

  const roles = async () =>
    (await frodo.role.readInternalRoles()).sort((a, b) =>
      (a.name || a._id || '').localeCompare(b.name || b._id || '')
    );

  registerEntityPickFamily({
    family: 'role',
    picks: [
      entityPick<InternalRole>({
        name: 'roleId',
        kind: 'role',
        load: roles,
        label: (role) => role.name || role._id || '',
        value: (role) => role._id ?? '',
        description: (role) => role.description,
        search: (role, query) =>
          `${role.name ?? ''} ${role._id ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      }),
      entityPick<InternalRole>({
        name: 'roleName',
        kind: 'role',
        load: roles,
        label: (role) => role.name || role._id || '',
        description: (role) => role.description,
      }),
    ],
  });

  // `saml`: the SAML entity providers of the realm, by entity id. `saml cot`
  // has its own entry below; its commands have no `entityId` option.
  type Saml2ProviderStub = Awaited<
    ReturnType<typeof frodo.saml2.entityProvider.readSaml2ProviderStubs>
  >[number];

  registerEntityPickFamily({
    family: 'saml',
    picks: [
      entityPick<Saml2ProviderStub>({
        name: 'entityId',
        kind: 'entity provider',
        load: async () =>
          (await frodo.saml2.entityProvider.readSaml2ProviderStubs()).sort(
            (a, b) => a.entityId.localeCompare(b.entityId)
          ),
        label: (provider) => provider.entityId,
        description: (provider) => provider.location,
      }),
    ],
  });

  // `saml cot`: the circles of trust of the realm, by id.
  type CircleOfTrust = Awaited<
    ReturnType<typeof frodo.saml2.circlesOfTrust.readCirclesOfTrust>
  >[number];

  registerEntityPickFamily({
    family: 'saml cot',
    picks: [
      entityPick<CircleOfTrust>({
        name: 'cotId',
        kind: 'circle of trust',
        load: async () =>
          (await frodo.saml2.circlesOfTrust.readCirclesOfTrust()).sort((a, b) =>
            a._id.localeCompare(b._id)
          ),
        label: (cot) => cot._id,
      }),
    ],
  });
}
