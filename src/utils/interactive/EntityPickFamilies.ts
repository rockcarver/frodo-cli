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
  type CIMDProfileSkeleton,
  type CustomNodeSkeleton,
  type OAuth2TrustedJwtIssuerSkeleton,
  type PolicySetSkeleton,
  type PolicySkeleton,
  type RemoteProxySkeleton,
  type ResourceTypeSkeleton,
  type ScriptSkeleton,
  type SecretSkeleton,
  type SecretStoreMappingSkeleton,
  type ThemeSkeleton,
  type TreeSkeleton,
  type VariableSkeleton,
  type WorkflowGroup,
} from '@rockcarver/frodo-lib';
import type { Command } from 'commander';
import { catalogOptionsOf } from '../ApplicationTemplateSource';
import { displayNameOf, groupTemplates } from '../ApplicationTemplateView';
import {
  sameHost,
  savedConnectionProfiles,
  type SavedProfile,
} from '../SavedProfiles';
import { getActiveActionCommand } from './ActiveActionCommandState';
import { entityPick } from './EntityPickers';
import { registerEntityPickFamily } from './EntityPickRegistry';
import { positionalValue } from './PositionalArgs';
import {
  createSubjectSource,
  SUBJECT_LIST_LIMIT,
  subjectMatches,
  type SubjectCandidate,
} from './Rfc7523Subjects';

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

/**
 * The template skeleton type isn't exported from frodo-lib's root; derive it
 * from the read function instead of importing an unexported name.
 */
type EmailTemplateSkeleton = Awaited<
  ReturnType<typeof frodo.email.template.readEmailTemplates>
>[number];

/** The name of an email template: its configuration id without the type prefix. */
function emailTemplateName(template: EmailTemplateSkeleton): string {
  return template._id?.replace('emailTemplate/', '') ?? '';
}

/** A secret store (the library exports no name for the union of the store types). */
type SecretStore = Awaited<
  ReturnType<typeof frodo.secretStore.readSecretStores>
>[number];

/**
 * The value of an option of the command that is being run. A loader that has
 * to narrow its list by another option (the global secret stores of `-g`, the
 * store a mapping belongs to) reads it here, because a loader has no
 * parameters.
 * @param {string} name attribute name of the option
 * @returns {unknown} the value, undefined when it is not set or no command is active
 */
function activeOption(name: string): unknown {
  return getActiveActionCommand()?.getOptionValue(name);
}

const CONNECTOR_ID_PREFIX = 'provisioner.openicf/';

/** The id of a connector: its configuration id without the type prefix. */
function connectorId(connector: { _id?: string }): string {
  return (connector._id ?? '').slice(CONNECTOR_ID_PREFIX.length);
}

/**
 * The first client id URL pattern of a CIMD profile, for the picker row. The
 * library returns the plain shape; the by-id read of the server wraps a member
 * as `{ inherited, value }`, so both are read.
 */
function firstCIMDPattern(profile: CIMDProfileSkeleton): string | undefined {
  const member: unknown = profile.cimdConfig?.cimdClientIdUrlPatterns;
  const patterns = Array.isArray(member)
    ? member
    : (member as { value?: unknown } | undefined)?.value;
  return Array.isArray(patterns) ? patterns[0] : undefined;
}

export function registerEntityPickFamilies(): void {
  // The agents (`frodo agent`). Each type has a group of its own and an entry of
  // its own, so the generic entry leaves the typed groups out: a command would
  // inherit two pickers for -i otherwise. `describe` takes -i as optional (without
  // it every agent is described), so its command line is complete without it and it
  // gets no picker (record 0047). `export` of
  // the generic group stays out: its -g is an alternative to -i that does not
  // conflict with it, and the framework cannot yet tell that -g already answers
  // the question (cli#1081).
  type AgentSkeleton = Awaited<
    ReturnType<typeof frodo.agent.readAgents>
  >[number];

  const byAgentId = (a: AgentSkeleton, b: AgentSkeleton) =>
    (a._id ?? '').localeCompare(b._id ?? '');

  const aiAgents = {
    group: 'ai',
    kind: 'AI agent',
    read: () => frodo.agent.readAIAgents(),
  };

  const typedAgents = [
    aiAgents,
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

  // The AI agents are also a root group of their own (`frodo aiagent`), and
  // `frodo agent ai` stays registered from the same commands while it is
  // deprecated: both paths get the same picks.
  const typedFamilies = [
    ...typedAgents.map((typed) => ({
      ...typed,
      family: `agent ${typed.group}`,
    })),
    { ...aiAgents, family: 'aiagent' },
  ];

  for (const { family, kind, read } of typedFamilies) {
    registerEntityPickFamily({
      family,
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
        // the saved profiles are read from this machine
        needsLogin: false,
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

  // The additional service accounts saved on a connection profile (`describe`
  // and `remove`). The commands are local: they read and write the profile file
  // and never log in, so the pick says it needs no login and the pass opens it
  // without one. The profile is the host the command was given (a URL, an alias
  // or part of one, as the commands themselves take it) or the host of the
  // environment. `add` names a service account that does not exist yet.
  type ServiceAccountRow = ReturnType<
    typeof frodo.conn.listAdditionalServiceAccounts
  >[number];

  registerEntityPickFamily({
    family: 'conn service-account',
    except: ['add'],
    picks: [
      entityPick<ServiceAccountRow>({
        name: 'name',
        kind: 'service account',
        needsLogin: false,
        load: async () =>
          frodo.conn.listAdditionalServiceAccounts(state.getHost()),
        loadFor: async (command) =>
          frodo.conn.listAdditionalServiceAccounts(
            positionalValue(command, 'host') ?? state.getHost()
          ),
        label: (account) => account.name,
        description: (account) => account.svcacctId,
      }),
    ],
  });

  // Authorization policies: the policy that `-i` names. `--set-id` of `delete`
  // and `export` is not offered a pick: it narrows `-a` to one policy set, so a
  // pick would open on a complete command line such as `delete -a` (record
  // 0047). `import` takes its option from a file (see `NEW_ENTITY_VERBS`).
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

  // IGA workflows: the workflow that `-i` names. `describe` takes `-i` or `-f`
  // (the workflow inside a file) as one of two; the framework does not open the
  // pick when `-f` is given, so a complete command line is left alone (record
  // 0047). A tenant without IGA has no workflows to offer: the commands say so
  // themselves once the pick is satisfied.
  registerEntityPickFamily({
    family: 'iga workflow',
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

  // The users of an RFC7523 assertion are offered from the trusted issuer of
  // the client, so the source of the candidates is made for the command that
  // runs the pick, and the search steps read it from the command they are given.
  type SubjectSource = ReturnType<typeof createSubjectSource>;
  const subjectSources = new WeakMap<Command, SubjectSource>();
  const subjectsOf = (command: Command | undefined): SubjectSource => {
    const clientId = () => command?.getOptionValue('clientId') as string;
    if (!command) return createSubjectSource(clientId);
    let source = subjectSources.get(command);
    if (!source) {
      source = createSubjectSource(clientId);
      subjectSources.set(command, source);
    }
    return source;
  };

  // The OAuth2 client a command acts as (`--client-id` of `get-access-token`
  // and `execute-rfc7523-authz-grant-flow`), and the user that
  // `execute-rfc7523-authz-grant-flow` gets tokens for (`--sub`, from the users
  // the trusted issuer of the client allows, else the realm's; it is asked for
  // after the client). Left out are the commands whose `--client-id` is
  // optional, or names a client that does not exist yet.
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
      entityPick<SubjectCandidate>({
        name: 'sub',
        kind: 'user',
        message: 'Select the user to get tokens for:',
        load: () => subjectsOf(getActiveActionCommand()).list(),
        loadFor: (command) => subjectsOf(command).list(),
        label: (user) => user.row,
        value: (user) => user.id,
        description: (user) => user.mail,
        search: subjectMatches,
        searchFirst: {
          when: (command) => subjectsOf(command).tooMany(),
          message: 'Search users:',
          hint: `The realm has ${SUBJECT_LIST_LIMIT} or more users. Type part of a username, first or last name or email, or a whole id.`,
          load: (text, command) => subjectsOf(command).search(text),
        },
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

  // `mapping delete` narrows the list by `-c` and `-t`: the loader reads them
  // from the command that runs the pick. The other commands of the family have
  // no such options, and get the whole list.
  const mappings = async (connectorId?: string, managedObjectType?: string) =>
    (await frodo.idm.mapping.readMappings(connectorId, managedObjectType)).sort(
      (a, b) =>
        (a.displayName || a.name || '').localeCompare(
          b.displayName || b.name || ''
        )
    );

  registerEntityPickFamily({
    family: 'mapping',
    picks: [
      entityPick<Mapping>({
        name: 'mappingId',
        kind: 'mapping',
        scopedBy: ['connectorId', 'managedObjectType'],
        load: () => mappings(),
        loadFor: (command) =>
          mappings(
            command.getOptionValue('connectorId'),
            command.getOptionValue('managedObjectType')
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

  // `app template`: the application templates, one row per template (not per
  // version), by id (for example `azure.ad`) for -i and by display name for -n.
  // The picker lists the catalog the command reads (`--templates` or
  // `--channel`) with the templates of the tenant merged in; it runs after a
  // login, so a command that needs no tenant never opens it. The version is
  // not picked: -v names it, and the newest is the default.
  type ApplicationTemplate = Awaited<
    ReturnType<typeof frodo.app.template.listTemplates>
  >[number];

  /** The newest version of every template of a list, in the order of the list. */
  const newestTemplates = (
    templates: ApplicationTemplate[]
  ): ApplicationTemplate[] =>
    groupTemplates(templates).map((group) => group.newest);

  const templateDescription = (template: ApplicationTemplate): string =>
    [
      template.displayName,
      template.templateType,
      template.isOverride ? 'defined by the tenant' : undefined,
    ]
      .filter(Boolean)
      .join(' · ');

  const loadTemplates = async (
    command?: Command
  ): Promise<ApplicationTemplate[]> =>
    newestTemplates(
      await frodo.app.template.listTemplates({
        ...(command ? catalogOptionsOf(command.opts()) : {}),
        includeOverrides: true,
      })
    );

  registerEntityPickFamily({
    family: 'app template',
    picks: [
      entityPick<ApplicationTemplate>({
        name: 'templateId',
        kind: 'application template',
        load: async () => loadTemplates(),
        loadFor: async (command) => loadTemplates(command),
        label: (template) => template.name,
        description: templateDescription,
        search: (template, query) =>
          `${template.name} ${template.displayName ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      }),
      entityPick<ApplicationTemplate>({
        name: 'templateName',
        kind: 'application template',
        load: async () => loadTemplates(),
        loadFor: async (command) => loadTemplates(command),
        label: (template) => displayNameOf(template),
        description: (template) => template.name,
        search: (template, query) =>
          `${template.name} ${template.displayName ?? ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
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

  // `oauth cimd`: the CIMD profiles of the realm, by id. The library returns
  // them sorted by id (and none for a realm that does not offer the type, which
  // the framework counts as satisfied). `import` names a profile in a file and
  // never inherits a pick.
  registerEntityPickFamily({
    family: 'oauth cimd',
    picks: [
      entityPick<CIMDProfileSkeleton>({
        name: 'profileId',
        kind: 'CIMD profile',
        load: async () => frodo.oauth2oidc.cimd.readCIMDProfiles(),
        label: (profile) => profile._id ?? '',
        description: (profile) => firstCIMDPattern(profile),
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

  // `oauth issuer`: the OAuth2 trusted JWT issuers of the realm, by the name of
  // the object. The description is the issuer value its assertions carry, which
  // is what tells two issuers apart when their names do not. The library returns
  // the plain shape from a query; a read by id wraps a member as
  // `{ inherited, value }`, so both are read.
  const issuerValueOf = (
    issuer: OAuth2TrustedJwtIssuerSkeleton
  ): string | undefined => {
    const member: unknown = issuer.issuer;
    const value =
      typeof member === 'string'
        ? member
        : (member as { value?: unknown } | undefined)?.value;
    return typeof value === 'string' ? value : undefined;
  };

  registerEntityPickFamily({
    family: 'oauth issuer',
    picks: [
      entityPick<OAuth2TrustedJwtIssuerSkeleton>({
        name: 'issuerId',
        kind: 'trusted JWT issuer',
        load: async () =>
          (await frodo.oauth2oidc.issuer.readOAuth2TrustedJwtIssuers()).sort(
            (a, b) => (a._id ?? '').localeCompare(b._id ?? '')
          ),
        label: (issuer) => issuer._id ?? '',
        description: issuerValueOf,
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

  // `import` names a template in a file (left out by default).
  registerEntityPickFamily({
    family: 'email template',
    picks: [
      entityPick<EmailTemplateSkeleton>({
        name: 'templateId',
        kind: 'email template',
        load: () => frodo.email.template.readEmailTemplates(false),
        label: emailTemplateName,
      }),
    ],
  });

  // `describe` takes -i as an optional filter: without it it covers every
  // journey, so nothing is missing for a pick to fill. `validate` selects the
  // journeys with -i, -a or -A (a one-of group), so it gets the picker.
  // `import` names a journey in a file (left out by default).
  registerEntityPickFamily({
    family: 'journey',
    except: ['describe'],
    onRequest: ['describe'],
    picks: [
      entityPick<TreeSkeleton>({
        name: 'journeyId',
        kind: 'journey',
        load: () => frodo.authn.journey.readJourneys(),
        label: (journey) => journey._id ?? '',
      }),
    ],
  });

  // `describe` and `type describe` take -i and -n as an optional filter
  // (every custom node, or every node type, without them). `import` names a
  // node in a file (left out by default). The id and the name conflict: the
  // runner asks for one of them, see EntityPickers.
  registerEntityPickFamily({
    family: 'node',
    except: ['describe', 'type describe'],
    onRequest: ['describe', 'type describe'],
    picks: [
      entityPick<CustomNodeSkeleton>({
        name: 'nodeId',
        kind: 'custom node',
        load: () => frodo.authn.node.readCustomNodes(),
        label: (node) => node.displayName || node._id || '',
        value: (node) => node._id ?? '',
        description: (node) => node.description,
      }),
      // `-n` is the display name of the node: a node without one cannot be named
      entityPick<CustomNodeSkeleton>({
        name: 'nodeName',
        kind: 'custom node',
        load: async () =>
          (await frodo.authn.node.readCustomNodes()).filter(
            (node) => node.displayName
          ),
        label: (node) => node.displayName ?? '',
        description: (node) => node.description,
      }),
    ],
  });

  // `import` names a script in a file (left out by default). The id and the
  // name conflict: the runner asks for one of them, see EntityPickers.
  registerEntityPickFamily({
    family: 'script',
    picks: [
      entityPick<ScriptSkeleton>({
        name: 'scriptId',
        kind: 'script',
        load: () => frodo.script.readScripts(),
        label: (script) => script.name,
        value: (script) => script._id,
        description: (script) => script.description,
      }),
      entityPick<ScriptSkeleton>({
        name: 'scriptName',
        kind: 'script',
        load: () => frodo.script.readScripts(),
        label: (script) => script.name,
        description: (script) => script.description,
      }),
    ],
  });

  // `import` names a theme in a file (left out by default). The id and the
  // name conflict: the runner asks for one of them, see EntityPickers.
  registerEntityPickFamily({
    family: 'theme',
    picks: [
      entityPick<ThemeSkeleton>({
        name: 'themeId',
        kind: 'theme',
        load: () => frodo.theme.readThemes(),
        label: (theme) => theme.name ?? '',
        value: (theme) => theme._id ?? '',
        description: (theme) => (theme.isDefault ? 'default theme' : undefined),
      }),
      entityPick<ThemeSkeleton>({
        name: 'themeName',
        kind: 'theme',
        load: () => frodo.theme.readThemes(),
        label: (theme) => theme.name ?? '',
        description: (theme) => (theme.isDefault ? 'default theme' : undefined),
      }),
    ],
  });

  // Secrets of the environment (cloud only). `create` and `import` name a new
  // secret or one in a file and get no pick; `version create` adds a version to
  // a secret that exists, so it is included.
  registerEntityPickFamily({
    family: 'esv secret',
    include: ['version create'],
    picks: [
      entityPick<SecretSkeleton>({
        name: 'secretId',
        kind: 'secret',
        load: () => frodo.cloud.secret.readSecrets(),
        label: (secret) => secret._id ?? '',
        description: (secret) => secret.description,
      }),
    ],
  });

  // Variables of the environment (cloud only).
  registerEntityPickFamily({
    family: 'esv variable',
    picks: [
      entityPick<VariableSkeleton>({
        name: 'variableId',
        kind: 'variable',
        load: () => frodo.cloud.variable.readVariables(),
        label: (variable) => variable._id ?? '',
        description: (variable) => variable.description,
      }),
    ],
  });

  // Secret stores of the realm, or the global ones when the command is run
  // with `-g`. A store is addressed by its id; when two stores of different
  // types share an id the command still asks for `-t`, so the row shows the
  // type. Every command below `secretstore` that has the option inherits the
  // pick, including the mapping and alias commands. `import` names a store in
  // a file and is left out; the `create` commands of the mappings and the
  // aliases add to a store that exists, so they are included.
  registerEntityPickFamily({
    family: 'secretstore',
    include: ['mapping create', 'mapping alias create'],
    picks: [
      entityPick<SecretStore>({
        name: 'secretstoreId',
        kind: 'secret store',
        load: async () =>
          (
            await frodo.secretStore.readSecretStores(
              Boolean(activeOption('global'))
            )
          ).sort((a, b) => (a._id ?? '').localeCompare(b._id ?? '')),
        label: (store) => store._id ?? '',
        description: (store) => store._type?._id,
      }),
    ],
  });

  // The mappings of a secret store. Registered after the store, so that the
  // store is picked first: the loader reads the store (and its type and
  // scope) from the command, and offers nothing while there is none. `create`
  // names a mapping that does not exist yet and gets no pick; `alias create`
  // adds an alias to a mapping that does, so it is included.
  registerEntityPickFamily({
    family: 'secretstore mapping',
    include: ['alias create'],
    picks: [
      entityPick<SecretStoreMappingSkeleton>({
        name: 'secretId',
        kind: 'secret store mapping',
        load: async () => {
          const secretstoreId = activeOption('secretstoreId');
          return secretstoreId
            ? frodo.secretStore.readSecretStoreMappings(
                secretstoreId as string,
                activeOption('secretstoreType') as string | undefined,
                Boolean(activeOption('global'))
              )
            : [];
        },
        label: (mapping) => mapping.secretId ?? '',
        description: (mapping) => mapping.aliases?.join(', '),
      }),
    ],
  });

  // The Log API keys of the tenant (`log key delete -i`), by key id with the
  // name of the key as the description. `describe` takes `-i` as optional, so
  // its command line is complete without it and it gets no pick (record
  // 0047); with `-a` the option is a regex filter and the framework does not
  // open the pick.
  type LogApiKeyEntity = Awaited<
    ReturnType<typeof frodo.cloud.log.getLogApiKeys>
  >[number];

  registerEntityPickFamily({
    family: 'log key',
    except: ['describe'],
    picks: [
      entityPick<LogApiKeyEntity>({
        name: 'keyId',
        kind: 'log API key',
        load: async () =>
          (await frodo.cloud.log.getLogApiKeys()).sort((a, b) =>
            a.api_key_id.localeCompare(b.api_key_id)
          ),
        label: (key) => key.api_key_id,
        description: (key) => key.name,
      }),
    ],
  });

  // The AM services: `service export -i` (`--service-id`) and `service delete -i`
  // (`--id`). `-g` switches between the services of the realm and the global
  // ones, so the loader reads it from the command.
  type AmService = Awaited<
    ReturnType<typeof frodo.service.getListOfServices>
  >[number];

  const services = async (global: boolean) =>
    (await frodo.service.getListOfServices(global)).sort((a, b) =>
      (a._id ?? '').localeCompare(b._id ?? '')
    );

  registerEntityPickFamily({
    family: 'service',
    picks: ['serviceId', 'id'].map((name) =>
      entityPick<AmService>({
        name,
        kind: 'service',
        load: () => services(false),
        loadFor: (command) =>
          services(Boolean(command.getOptionValue('global'))),
        label: (service) => service._id ?? '',
        description: (service) =>
          typeof service.name === 'string' ? service.name : undefined,
      })
    ),
  });

  // `connector`: the IDM connectors, by id. The configuration of the connector
  // info provider (`provisioner.openicf.connectorinfoprovider`) is not a
  // connector and is left out.
  type Connector = Awaited<
    ReturnType<typeof frodo.idm.connector.readConnectors>
  >[number];

  registerEntityPickFamily({
    family: 'connector',
    picks: [
      entityPick<Connector>({
        name: 'connectorId',
        kind: 'connector',
        load: async () =>
          (await frodo.idm.connector.readConnectors())
            .filter((connector) =>
              (connector._id ?? '').startsWith(CONNECTOR_ID_PREFIX)
            )
            .sort((a, b) => connectorId(a).localeCompare(connectorId(b))),
        label: connectorId,
        description: (connector) =>
          [
            connector.connectorRef?.displayName,
            connector.enabled === false ? 'disabled' : 'enabled',
          ]
            .filter(Boolean)
            .join(' · '),
      }),
    ],
  });
}
