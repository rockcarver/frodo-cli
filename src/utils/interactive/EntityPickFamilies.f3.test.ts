import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  frodo,
  state,
  type PolicySetSkeleton,
  type PolicySkeleton,
  type ResourceTypeSkeleton,
  type WorkflowGroup,
} from '@rockcarver/frodo-lib';
import { Command, Option } from 'commander';
import { registerEntityPickFamilies } from './EntityPickFamilies';
import { familyEntityPicks } from './EntityPickRegistry';

// The entity picks of the families `authz policy`, `authz set`, `authz type`
// and `iga workflow` (decision record 0038, frodo-cli#1081): which commands
// inherit them, and what the picker offers.

registerEntityPickFamilies();

/** The command `<path...>` with the given options, e.g. `-i, --policy-id <policy-id>`. */
function commandAt(path: string[], ...flags: string[]): Command {
  const root = new Command('frodo');
  let parent = root;
  for (const name of path.slice(0, -1)) {
    const group = new Command(name);
    parent.addCommand(group);
    parent = group;
  }
  const leaf = new Command(path[path.length - 1]);
  for (const flag of flags) leaf.addOption(new Option(flag));
  parent.addCommand(leaf);
  return leaf;
}

const picksOf = (path: string[], ...flags: string[]) =>
  familyEntityPicks(commandAt(path, ...flags));

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the authorization policy picker', () => {
  const policy = (name: string, applicationName?: string) =>
    ({ _id: name, name, applicationName }) as unknown as PolicySkeleton;

  it('belongs to the commands that take an existing policy by -i', () => {
    for (const verb of ['delete', 'describe', 'export']) {
      const picks = picksOf(
        ['authz', 'policy', verb],
        '-i, --policy-id <policy-id>'
      );
      expect(picks.map((pick) => pick.name)).toEqual(['policyId']);
    }
  });

  it('leaves out import, which takes the policy from a file', () => {
    expect(
      picksOf(['authz', 'policy', 'import'], '-i, --policy-id <policy-id>')
    ).toEqual([]);
  });

  it('offers no pick for --set-id: it narrows -a, so a pick would open on `delete -a`', () => {
    for (const verb of ['delete', 'export']) {
      expect(picksOf(['authz', 'policy', verb], '--set-id <set-id>')).toEqual(
        []
      );
    }
  });

  it('lists the policies of the realm by name, with the policy set as the description', async () => {
    jest
      .spyOn(frodo.authz.policy, 'readPolicies')
      .mockResolvedValue([
        policy('zeta', 'matrix'),
        policy('alpha', 'zion'),
        policy('mid'),
      ]);
    const [pick] = picksOf(
      ['authz', 'policy', 'describe'],
      '-i, --policy-id <policy-id>'
    );
    const rows = await pick.load();
    expect(rows.map(pick.label)).toEqual(['alpha', 'mid', 'zeta']);
    expect(rows.map((row) => pick.description?.(row))).toEqual([
      'policy set zion',
      undefined,
      'policy set matrix',
    ]);
    expect(pick.kind).toBe('authorization policy');
  });

  it('lets a failed load reach the framework, which declines the pick', async () => {
    jest
      .spyOn(frodo.authz.policy, 'readPolicies')
      .mockRejectedValue(new Error('forbidden'));
    const [pick] = picksOf(
      ['authz', 'policy', 'export'],
      '-i, --policy-id <policy-id>'
    );
    await expect(pick.load()).rejects.toThrow('forbidden');
  });
});

describe('the authorization policy set picker', () => {
  const set = (name: string) => ({ name }) as unknown as PolicySetSkeleton;

  it('belongs to delete, describe and export, not to import', () => {
    for (const verb of ['delete', 'describe', 'export']) {
      expect(
        picksOf(['authz', 'set', verb], '-i, --set-id <set-id>').map(
          (pick) => pick.name
        )
      ).toEqual(['setId']);
    }
    expect(
      picksOf(['authz', 'set', 'import'], '-i, --set-id <set-id>')
    ).toEqual([]);
  });

  it('lists the policy sets by name, in order', async () => {
    jest
      .spyOn(frodo.authz.policySet, 'readPolicySets')
      .mockResolvedValue([
        set('oauth2Scopes'),
        set('iPlanetAMWebAgentService'),
      ]);
    const [pick] = picksOf(
      ['authz', 'set', 'describe'],
      '-i, --set-id <set-id>'
    );
    const rows = await pick.load();
    expect(rows.map(pick.label)).toEqual([
      'iPlanetAMWebAgentService',
      'oauth2Scopes',
    ]);
    expect(pick.kind).toBe('policy set');
  });
});

describe('the authorization resource type picker', () => {
  const type = (name: string, uuid: string) =>
    ({ name, uuid }) as unknown as ResourceTypeSkeleton;
  const flags = ['-i, --type-id <type-id>', '-n, --type-name <type-name>'];

  it('offers the name first, then the uuid, to delete, describe and export', () => {
    for (const verb of ['delete', 'describe', 'export']) {
      expect(
        picksOf(['authz', 'type', verb], ...flags).map((pick) => pick.name)
      ).toEqual(['typeName', 'typeId']);
    }
  });

  it('leaves out import', () => {
    expect(picksOf(['authz', 'type', 'import'], ...flags)).toEqual([]);
  });

  it('lists the resource types by name; the uuid is the value of -i and the description of both rows', async () => {
    jest
      .spyOn(frodo.authz.resourceType, 'readResourceTypes')
      .mockResolvedValue([type('URL', 'uuid-2'), type('Calendar', 'uuid-1')]);
    const [byName, byId] = picksOf(['authz', 'type', 'describe'], ...flags);
    const rows = await byName.load();
    expect(rows.map(byName.label)).toEqual(['Calendar', 'URL']);
    expect(rows.map((row) => byName.value?.(row))).toEqual([
      undefined,
      undefined,
    ]);
    expect(rows.map((row) => byId.value?.(row))).toEqual(['uuid-1', 'uuid-2']);
    expect(rows.map((row) => byName.description?.(row))).toEqual([
      'uuid-1',
      'uuid-2',
    ]);
    expect(byName.kind).toBe('resource type');
  });
});

describe('the IGA workflow picker', () => {
  type Flow = { id: string; name: string; status: 'published' | 'draft' };
  const flow = (id: string, name: string, status: Flow['status']): Flow => ({
    id,
    name,
    status,
  });
  const group = (published?: Flow, draft?: Flow) =>
    ({ published, draft }) as unknown as WorkflowGroup;
  const flags = ['-i, --workflow-id <workflow-id>'];

  it('belongs to delete, export and publish', () => {
    for (const verb of ['delete', 'export', 'publish']) {
      expect(
        picksOf(['iga', 'workflow', verb], ...flags).map((pick) => pick.name)
      ).toEqual(['workflowId']);
    }
  });

  it('leaves out describe, which takes -i together with -f, and import', () => {
    expect(picksOf(['iga', 'workflow', 'describe'], ...flags)).toEqual([]);
    expect(picksOf(['iga', 'workflow', 'import'], ...flags)).toEqual([]);
  });

  it('lists the workflows by id, the published one before the draft, with the name as the description', async () => {
    jest.spyOn(state, 'getIsIGA').mockReturnValue(true);
    jest
      .spyOn(frodo.cloud.iga.workflow, 'readWorkflowGroups')
      .mockResolvedValue([
        group(flow('wf-b', 'Second', 'published')),
        group(
          flow('wf-a', 'First published', 'published'),
          flow('wf-a-draft', 'First draft', 'draft')
        ),
        group(undefined, flow('wf-c', 'Third draft', 'draft')),
      ]);
    const [pick] = picksOf(['iga', 'workflow', 'delete'], ...flags);
    const rows = await pick.load();
    expect(rows.map(pick.label)).toEqual(['wf-a', 'wf-b', 'wf-c']);
    expect(rows.map((row) => pick.description?.(row))).toEqual([
      'First published',
      'Second',
      'Third draft',
    ]);
  });

  it('offers nothing on a tenant without IGA, without reading workflows, so the command says so itself', async () => {
    jest.spyOn(state, 'getIsIGA').mockReturnValue(false);
    const read = jest.spyOn(frodo.cloud.iga.workflow, 'readWorkflowGroups');
    const [pick] = picksOf(['iga', 'workflow', 'export'], ...flags);
    expect(await pick.load()).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
});
