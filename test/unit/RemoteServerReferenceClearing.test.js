import { beforeEach, describe, expect, jest, test } from '@jest/globals';

/**
 * What `config-manager delete remote-servers` does about a connector server that
 * a server cluster or a connector still names (src/configManagerOps/
 * RemoteServerReferenceClearing.ts):
 *
 * - the table of what `--force` does for each source of the library lookup, and
 *   the plan that follows from it;
 * - the pure functions that read the configuration (the names of the connector
 *   servers, the server clusters that list one) and remove a connector server
 *   from it, without touching anything else;
 * - the one write that deletes a connector server and its name in the server
 *   clusters: it checks that the configuration is as the lookup saw it, writes
 *   once, reads the configuration again and, if IDM did not keep exactly what was
 *   written, writes the original back and says whether that worked;
 * - the words of the plan of a delete of one connector server and of all of
 *   them.
 *
 * The library is a stub that keeps the configuration in memory, so the tests see
 * every read and every write in order. The module under test is real.
 */

const readConfigEntity = jest.fn();
const updateConfigEntity = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: { idm: { config: { readConfigEntity, updateConfigEntity } } },
}));

const {
  bulkPlanLines,
  clustersLeftEmpty,
  clustersListing,
  CONNECTOR_SERVER_CONFIG_ID,
  connectorServersOf,
  deleteRemoteServerWithLinks,
  describeReference,
  HOLDER_RULES,
  namedPlanLines,
  planRemoteServerDelete,
  referenceLine,
  removeServerFromEntity,
} = await import('../../src/configManagerOps/RemoteServerReferenceClearing');

const cluster = (id) => ({
  source: 'server-cluster',
  dependency: 'soft',
  id,
  from: 'serversList',
});
const connector = (id) => ({
  source: 'connector',
  dependency: 'hard',
  id,
  from: 'connectorRef.connectorHostRef',
});

/** The configuration as IDM answers it: three connector servers and two server clusters. */
const entity = () => ({
  _id: CONNECTOR_SERVER_CONFIG_ID,
  connectorsLocation: 'connectors',
  remoteConnectorClients: [
    { clientId: 'c1', enabled: true, name: 'asdf', useSSL: true },
    { enabled: true, name: 'rcs', useSSL: true },
    { enabled: false, name: 'third', useSSL: false },
  ],
  remoteConnectorClientsGroups: [
    {
      algorithm: 'failover',
      name: 'cluster',
      serversList: [{ name: 'asdf' }, { name: 'rcs' }],
    },
    { algorithm: 'roundrobin', name: 'solo', serversList: [{ name: 'rcs' }] },
    { algorithm: 'failover', name: 'other', serversList: [{ name: 'third' }] },
  ],
  remoteConnectorServers: [{ name: 'platform-side' }],
  remoteConnectorServersGroups: [],
});

describe('the table of what --force does', () => {
  test('has one row for each source of the lookup, and the sources are the two that the library reports', () => {
    expect(Object.keys(HOLDER_RULES).sort()).toEqual([
      'connector',
      'server-cluster',
    ]);
  });

  test('a server cluster loses the name, a connector is left alone', () => {
    expect(HOLDER_RULES['server-cluster']).toEqual({
      action: 'remove-name',
      holder: 'server cluster',
    });
    expect(HOLDER_RULES.connector).toEqual({
      action: 'leave',
      holder: 'connector',
    });
  });
});

describe('planRemoteServerDelete', () => {
  const references = [cluster('cluster'), connector('zion'), cluster('solo')];

  test('removes the name from the server clusters and leaves the connectors', () => {
    expect(planRemoteServerDelete(references)).toEqual({
      clusters: [cluster('cluster'), cluster('solo')],
      keptClusters: [],
      left: [connector('zion')],
    });
  });

  test('--keep-links keeps the server clusters as they are, and still leaves the connectors', () => {
    expect(planRemoteServerDelete(references, { keepLinks: true })).toEqual({
      clusters: [],
      keptClusters: [cluster('cluster'), cluster('solo')],
      left: [connector('zion')],
    });
  });

  test('has nothing to do for nothing', () => {
    expect(planRemoteServerDelete([])).toEqual({
      clusters: [],
      keptClusters: [],
      left: [],
    });
  });
});

describe('the words for a holder', () => {
  test('say what it is, its id and the field, and the library flag', () => {
    expect(describeReference(cluster('cluster'))).toBe(
      "server cluster 'cluster' (serversList)"
    );
    expect(referenceLine(cluster('cluster'))).toBe(
      "server cluster 'cluster' (serversList), soft"
    );
    expect(referenceLine(connector('zion'))).toBe(
      "connector 'zion' (connectorRef.connectorHostRef), hard"
    );
  });
});

describe('connectorServersOf', () => {
  test('lists the names in the order of the list', () => {
    expect(connectorServersOf(entity())).toEqual({
      names: ['asdf', 'rcs', 'third'],
      nameless: 0,
    });
  });

  test('an absent list is an empty list, and so is null', () => {
    expect(connectorServersOf({ _id: 'x' })).toEqual({
      names: [],
      nameless: 0,
    });
    expect(
      connectorServersOf({ remoteConnectorClients: null }).names
    ).toEqual([]);
  });

  test('an entry that has no name that can be matched is counted and never selected', () => {
    expect(
      connectorServersOf({
        remoteConnectorClients: [
          { enabled: true },
          { name: '' },
          { name: 7 },
          null,
          'text',
          [],
          { name: 'rcs' },
        ],
      })
    ).toEqual({ names: ['rcs'], nameless: 6 });
  });

  test('a name that two entries have is one name', () => {
    expect(
      connectorServersOf({
        remoteConnectorClients: [{ name: 'dup' }, { name: 'x' }, { name: 'dup' }],
      })
    ).toEqual({ names: ['dup', 'x'], nameless: 0 });
  });

  test('a case or a blank that differs is another name', () => {
    expect(
      connectorServersOf({
        remoteConnectorClients: [{ name: 'RCS' }, { name: ' rcs' }, { name: 'rcs' }],
      }).names
    ).toEqual(['RCS', ' rcs', 'rcs']);
  });

  test.each([[{}], ['rcs'], [3], [true]])(
    'something that is not a list in the place of the list (%j) is an error, not an empty list',
    (value) => {
      expect(() =>
        connectorServersOf({ remoteConnectorClients: value })
      ).toThrow('is not a list');
    }
  );
});

describe('clustersListing', () => {
  test('names the server clusters that list the connector server, in order, each once', () => {
    expect(clustersListing(entity(), 'rcs')).toEqual(['cluster', 'solo']);
    expect(clustersListing(entity(), 'asdf')).toEqual(['cluster']);
    expect(clustersListing(entity(), 'nobody')).toEqual([]);
  });

  test('a cluster that lists the name twice is named once, and a case that differs is another name', () => {
    const twice = {
      remoteConnectorClientsGroups: [
        { name: 'c', serversList: [{ name: 'rcs' }, { name: 'rcs' }] },
        { name: 'd', serversList: [{ name: 'RCS' }] },
      ],
    };
    expect(clustersListing(twice, 'rcs')).toEqual(['c']);
  });

  test('absent lists, a cluster without a list and malformed entries are none', () => {
    expect(clustersListing({}, 'rcs')).toEqual([]);
    expect(
      clustersListing(
        {
          remoteConnectorClientsGroups: [
            { name: 'a' },
            { name: 'b', serversList: 'rcs' },
            null,
            { serversList: [{ name: 'rcs' }] },
            { name: 'e', serversList: [null, 'rcs'] },
          ],
        },
        'rcs'
      )
    ).toEqual([]);
  });
});

describe('clustersLeftEmpty', () => {
  test('names the clusters whose every connector server is deleted', () => {
    expect(clustersLeftEmpty(entity(), ['rcs'])).toEqual(['solo']);
    expect(clustersLeftEmpty(entity(), ['asdf', 'rcs'])).toEqual([
      'cluster',
      'solo',
    ]);
    expect(clustersLeftEmpty(entity(), ['asdf', 'rcs', 'third'])).toEqual([
      'cluster',
      'solo',
      'other',
    ]);
  });

  test('a cluster that keeps one, and a cluster that was empty already, are not named', () => {
    expect(clustersLeftEmpty(entity(), ['asdf'])).toEqual([]);
    expect(
      clustersLeftEmpty(
        { remoteConnectorClientsGroups: [{ name: 'e', serversList: [] }] },
        ['rcs']
      )
    ).toEqual([]);
  });
});

describe('removeServerFromEntity', () => {
  test('removes the entry and the name in the named clusters, and nothing else', () => {
    const before = entity();
    const { entity: after, emptied } = removeServerFromEntity(before, 'rcs', [
      'cluster',
      'solo',
    ]);

    const expected = entity();
    expected.remoteConnectorClients.splice(1, 1);
    expected.remoteConnectorClientsGroups[0].serversList.splice(1, 1);
    expected.remoteConnectorClientsGroups[1].serversList = [];
    expect(after).toEqual(expected);
    expect(emptied).toEqual(['solo']);
  });

  test('leaves the input as it was', () => {
    const before = entity();
    removeServerFromEntity(before, 'rcs', ['cluster', 'solo']);

    expect(before).toEqual(entity());
  });

  test('keeps the order of the keys, the other lists and the other entries', () => {
    const { entity: after } = removeServerFromEntity(entity(), 'asdf', [
      'cluster',
    ]);

    expect(Object.keys(after)).toEqual(Object.keys(entity()));
    expect(after.remoteConnectorServers).toEqual([{ name: 'platform-side' }]);
    expect(after.remoteConnectorClients.map((entry) => entry.name)).toEqual([
      'rcs',
      'third',
    ]);
    expect(after.remoteConnectorClientsGroups[0]).toEqual({
      algorithm: 'failover',
      name: 'cluster',
      serversList: [{ name: 'rcs' }],
    });
  });

  test('a server cluster that is not named keeps its list, also when it lists the name', () => {
    const { entity: after, emptied } = removeServerFromEntity(entity(), 'rcs', [
      'cluster',
    ]);

    expect(after.remoteConnectorClientsGroups[1].serversList).toEqual([
      { name: 'rcs' },
    ]);
    expect(emptied).toEqual([]);
  });

  test('with no cluster named, only the connector server goes', () => {
    const { entity: after } = removeServerFromEntity(entity(), 'rcs', []);

    expect(after.remoteConnectorClients).toHaveLength(2);
    expect(after.remoteConnectorClientsGroups).toEqual(
      entity().remoteConnectorClientsGroups
    );
  });

  test('removes every entry of the name, and the name twice in one list', () => {
    const twice = {
      remoteConnectorClients: [{ name: 'dup' }, { name: 'x' }, { name: 'dup' }],
      remoteConnectorClientsGroups: [
        { name: 'c', serversList: [{ name: 'dup' }, { name: 'dup' }] },
      ],
    };
    const { entity: after, emptied } = removeServerFromEntity(twice, 'dup', [
      'c',
    ]);

    expect(after.remoteConnectorClients).toEqual([{ name: 'x' }]);
    expect(after.remoteConnectorClientsGroups[0].serversList).toEqual([]);
    expect(emptied).toEqual(['c']);
  });

  test('does not make a list that the configuration does not have', () => {
    const { entity: after } = removeServerFromEntity({ _id: 'x' }, 'rcs', [
      'c',
    ]);

    expect(after).toEqual({ _id: 'x' });
  });

  test('a name that is not in the configuration changes nothing', () => {
    const { entity: after, emptied } = removeServerFromEntity(
      entity(),
      'nobody',
      ['cluster']
    );

    expect(after).toEqual(entity());
    expect(emptied).toEqual([]);
  });
});

describe('deleteRemoteServerWithLinks', () => {
  /** What the tenant holds, and what the next reads and writes do to it. */
  let stored;
  /** `normalise` changes what is stored by a write (IDM adds or drops something). */
  let normalise;
  let calls;

  beforeEach(() => {
    jest.clearAllMocks();
    stored = entity();
    normalise = (body) => body;
    calls = [];
    readConfigEntity.mockReset().mockImplementation(async (id) => {
      calls.push(['read', id]);
      return structuredClone(stored);
    });
    updateConfigEntity.mockReset().mockImplementation(async (id, body) => {
      calls.push(['write', id, structuredClone(body)]);
      stored = normalise(structuredClone(body));
      return stored;
    });
  });

  const writes = () => calls.filter(([type]) => type === 'write');

  test('reads, writes once the configuration without the connector server and its names, and reads again', async () => {
    const result = await deleteRemoteServerWithLinks('rcs', {
      clusters: ['cluster', 'solo'],
      seen: ['cluster', 'solo'],
    });

    expect(calls.map(([type]) => type)).toEqual(['read', 'write', 'read']);
    const expected = entity();
    expected.remoteConnectorClients.splice(1, 1);
    expected.remoteConnectorClientsGroups[0].serversList.splice(1, 1);
    expected.remoteConnectorClientsGroups[1].serversList = [];
    expect(writes()).toEqual([['write', CONNECTOR_SERVER_CONFIG_ID, expected]]);
    expect(stored).toEqual(expected);
    expect(result).toEqual({
      removedFrom: ['cluster', 'solo'],
      emptied: ['solo'],
    });
  });

  test('with no cluster it writes the configuration without the connector server only', async () => {
    const result = await deleteRemoteServerWithLinks('third', {
      clusters: [],
      seen: ['other'],
    });

    expect(writes()).toHaveLength(1);
    expect(stored.remoteConnectorClients.map((entry) => entry.name)).toEqual([
      'asdf',
      'rcs',
    ]);
    // --keep-links: the cluster keeps the name
    expect(stored.remoteConnectorClientsGroups[2].serversList).toEqual([
      { name: 'third' },
    ]);
    expect(result).toEqual({ removedFrom: [], emptied: [] });
  });

  test('a revision that changes with every write is not a difference', async () => {
    normalise = (body) => ({ ...body, _rev: 'changed' });

    await expect(
      deleteRemoteServerWithLinks('rcs', { clusters: [], seen: [] })
    ).rejects.toMatchObject({ holderChanged: false });
  });

  test('an answer that differs only in the order of the keys is the same', async () => {
    normalise = (body) => Object.fromEntries(Object.entries(body).reverse());

    await expect(
      deleteRemoteServerWithLinks('third', { clusters: [], seen: ['other'] })
    ).resolves.toEqual({ removedFrom: [], emptied: [] });
    expect(writes()).toHaveLength(1);
  });

  describe('the configuration is not as the lookup saw it: nothing is written', () => {
    test('the connector server is gone', async () => {
      stored.remoteConnectorClients.splice(1, 1);

      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: ['cluster'],
        seen: ['cluster', 'solo'],
      }).catch((caught) => caught);

      expect(error.message).toContain(
        "Connector server 'rcs' is not in the configuration any more"
      );
      expect(error.message).toContain('nothing was written');
      expect(error.holderChanged).toBe(false);
      expect(writes()).toEqual([]);
    });

    test('a server cluster was added', async () => {
      stored.remoteConnectorClientsGroups.push({
        name: 'new',
        serversList: [{ name: 'rcs' }],
      });

      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: ['cluster', 'solo'],
        seen: ['cluster', 'solo'],
      }).catch((caught) => caught);

      expect(error.message).toContain('changed after they were looked up');
      expect(error.message).toContain('they were: cluster, solo; now: cluster, solo, new');
      expect(error.message).toContain('nothing was written');
      expect(error.holderChanged).toBe(false);
      expect(writes()).toEqual([]);
    });

    test('a server cluster dropped the name', async () => {
      stored.remoteConnectorClientsGroups[1].serversList = [];

      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: ['cluster', 'solo'],
        seen: ['cluster', 'solo'],
      }).catch((caught) => caught);

      expect(error.holderChanged).toBe(false);
      expect(error.message).toContain('now: cluster');
      expect(writes()).toEqual([]);
    });

    test('a server cluster that was swapped for another one: the count is the same, the names are not', async () => {
      // the lookup saw `cluster` and `solo`; now `solo` has dropped the name and a new cluster lists it
      stored.remoteConnectorClientsGroups[1].serversList = [];
      stored.remoteConnectorClientsGroups.push({
        name: 'swapped',
        serversList: [{ name: 'rcs' }],
      });

      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: ['cluster', 'solo'],
        seen: ['cluster', 'solo'],
      }).catch((caught) => caught);

      expect(error.holderChanged).toBe(false);
      expect(error.message).toContain(
        'they were: cluster, solo; now: cluster, swapped'
      );
      expect(writes()).toEqual([]);
    });

    test('two server clusters that have one name are one cluster to the check, as they are one name to the write', async () => {
      stored.remoteConnectorClientsGroups = [
        { name: 'twin', serversList: [{ name: 'rcs' }] },
        { name: 'twin', serversList: [{ name: 'rcs' }, { name: 'asdf' }] },
      ];

      // the library reports one reference for each of them
      const result = await deleteRemoteServerWithLinks('rcs', {
        clusters: ['twin', 'twin'],
        seen: ['twin', 'twin'],
      });

      expect(writes()).toHaveLength(1);
      // the message names the shared name once
      expect(result.removedFrom).toEqual(['twin']);
      expect(
        stored.remoteConnectorClientsGroups.map(({ serversList }) =>
          serversList.map(({ name }) => name)
        )
      ).toEqual([[], ['asdf']]);
    });

    test('the refusal names two clusters of one name once, as the check counts them', async () => {
      // the lookup saw `twin` twice (two clusters of that name); one of the twins is gone and another cluster lists the name
      stored.remoteConnectorClientsGroups = [
        { name: 'twin', serversList: [{ name: 'rcs' }] },
        { name: 'late', serversList: [{ name: 'rcs' }] },
      ];

      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: ['twin', 'twin'],
        seen: ['twin', 'twin'],
      }).catch((caught) => caught);

      expect(error.holderChanged).toBe(false);
      expect(error.message).toContain('they were: twin; now: twin, late');
      expect(error.message).not.toContain('twin, twin');
      expect(writes()).toEqual([]);
    });

    test('a lookup that saw none and now finds one', async () => {
      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: [],
        seen: [],
      }).catch((caught) => caught);

      expect(error.message).toContain('they were: none; now: cluster, solo');
      expect(writes()).toEqual([]);
    });

    test('without `seen` the clusters are not compared (the lookup could not be made)', async () => {
      await deleteRemoteServerWithLinks('rcs', { clusters: [] });

      expect(writes()).toHaveLength(1);
    });

    test('only the changes that matter are stale: another connector server may come and go', async () => {
      stored.remoteConnectorClients.push({ name: 'fourth' });

      await deleteRemoteServerWithLinks('rcs', {
        clusters: ['cluster', 'solo'],
        seen: ['cluster', 'solo'],
      });

      // the write is made from what was read just before it, so the new entry stays
      expect(stored.remoteConnectorClients.map((entry) => entry.name)).toEqual([
        'asdf',
        'third',
        'fourth',
      ]);
    });
  });

  describe('IDM does not keep what was written', () => {
    test('the original is written back, and the error says so and that the connector server is not deleted', async () => {
      const original = entity();
      let first = true;
      normalise = (body) => {
        if (!first) return body;
        first = false;
        // the first write loses the other list
        return { ...body, remoteConnectorServers: [] };
      };

      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: ['cluster'],
        seen: ['cluster', 'solo'],
      }).catch((caught) => caught);

      expect(error.holderChanged).toBe(false);
      expect(error.message).toContain('remoteConnectorServers');
      expect(error.message).toContain('written back as it was before');
      expect(error.message).toContain("connector server 'rcs' is not deleted");
      expect(writes()).toHaveLength(2);
      expect(writes()[1][2]).toEqual(original);
      expect(stored).toEqual(original);
    });

    test('names the fields that differ and never their values', async () => {
      let first = true;
      normalise = (body) => {
        if (!first) return body;
        first = false;
        return { ...body, connectorsLocation: 'a-secret-looking-value' };
      };

      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: [],
        seen: ['cluster', 'solo'],
      }).catch((caught) => caught);

      expect(error.message).toContain('connectorsLocation');
      expect(error.message).not.toContain('a-secret-looking-value');
      expect(error.message).not.toContain("'connectors'");
    });

    test('a write back that fails says what stays changed', async () => {
      let count = 0;
      updateConfigEntity.mockImplementation(async (id, body) => {
        calls.push(['write', id, structuredClone(body)]);
        count += 1;
        if (count === 2) throw new Error('refused by IDM');
        stored = { ...structuredClone(body), connectorsLocation: 'changed' };
        return stored;
      });

      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: [],
        seen: ['cluster', 'solo'],
      }).catch((caught) => caught);

      expect(error.holderChanged).toBe(true);
      expect(error.message).toContain('could NOT be written back');
      expect(error.message).toContain('the write failed (refused by IDM)');
      expect(error.message).toContain('connectorsLocation');
      expect(error.message).toContain('Check the connector servers');
    });

    test('a write back that is accepted and still differs says what stays changed', async () => {
      normalise = (body) => ({ ...body, connectorsLocation: 'changed' });

      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: [],
        seen: ['cluster', 'solo'],
      }).catch((caught) => caught);

      expect(error.holderChanged).toBe(true);
      expect(error.message).toContain(
        'the write was accepted, but the configuration still differs from the original'
      );
      expect(writes()).toHaveLength(2);
    });

    test('a read after the write back that fails says what stays changed', async () => {
      normalise = (body) => ({ ...body, connectorsLocation: 'changed' });
      let reads = 0;
      readConfigEntity.mockImplementation(async () => {
        reads += 1;
        // the read before, the read back, then the read after the restore
        if (reads === 3) throw new Error('cannot read');
        return structuredClone(stored);
      });

      const error = await deleteRemoteServerWithLinks('rcs', {
        clusters: [],
        seen: ['cluster', 'solo'],
      }).catch((caught) => caught);

      expect(error.holderChanged).toBe(true);
      expect(error.message).toContain(
        'the write was accepted, but the check read after it failed (cannot read)'
      );
    });
  });

  test('a read back that fails says that the configuration was written and may differ', async () => {
    let reads = 0;
    readConfigEntity.mockImplementation(async () => {
      reads += 1;
      if (reads === 2) throw new Error('cannot read');
      return structuredClone(stored);
    });

    const error = await deleteRemoteServerWithLinks('rcs', {
      clusters: [],
      seen: ['cluster', 'solo'],
    }).catch((caught) => caught);

    expect(error.holderChanged).toBe(true);
    expect(error.message).toContain('was written, but it could not be read again');
    expect(error.message).toContain('(cannot read)');
    // the write was applied: the message must not read as if nothing happened
    expect(error.message).toContain(
      "Connector server 'rcs' is probably deleted and the server clusters may be changed: check them by hand."
    );
    expect(writes()).toHaveLength(1);
  });

  test('a write that the library refuses is thrown as it is, after exactly one attempt', async () => {
    updateConfigEntity.mockReset().mockRejectedValue(new Error('refused'));

    await expect(
      deleteRemoteServerWithLinks('rcs', { clusters: [], seen: ['cluster', 'solo'] })
    ).rejects.toThrow('refused');
    expect(updateConfigEntity).toHaveBeenCalledTimes(1);
  });

  test('a read that fails stops before any write', async () => {
    readConfigEntity.mockReset().mockRejectedValue(new Error('cannot read'));

    await expect(
      deleteRemoteServerWithLinks('rcs', { clusters: [] })
    ).rejects.toThrow('cannot read');
    expect(updateConfigEntity).not.toHaveBeenCalled();
  });
});

describe('namedPlanLines', () => {
  const plan = {
    clusters: [cluster('cluster')],
    keptClusters: [cluster('kept')],
    left: [connector('zion')],
  };

  test('says what would be deleted, which server clusters lose the name, which keep it and what is left alone', () => {
    expect(namedPlanLines('rcs', plan, { emptied: ['cluster'] })).toEqual([
      "Dry run: would delete connector server 'rcs'.",
      '  In the same write, remove the connector server from the list of connector servers of these server clusters (--keep-links leaves them):',
      "    - server cluster 'cluster' (serversList)",
      '  Keep the name in these server clusters (--keep-links):',
      "    - server cluster 'kept' (serversList)",
      '  Leave these alone, they would name a connector server that does not exist afterwards:',
      "    - connector 'zion' (connectorRef.connectorHostRef), hard",
      "  Server cluster 'cluster' would have no connector server left.",
    ]);
  });

  test('the plan before a question says plan, not dry run', () => {
    expect(
      namedPlanLines('rcs', { clusters: [], keptClusters: [], left: [] }, {
        asPlan: true,
      })
    ).toEqual([
      "Plan: connector server 'rcs' would be deleted.",
      '  Nothing else names the connector server: no other object is changed.',
    ]);
  });

  test('a dry run of a connector server that nothing names says so', () => {
    expect(
      namedPlanLines('rcs', { clusters: [], keptClusters: [], left: [] })
    ).toEqual([
      "Dry run: would delete connector server 'rcs'.",
      '  Nothing else names the connector server.',
    ]);
  });

  test('a lookup that could not be made is not an empty plan', () => {
    const lines = namedPlanLines(
      'rcs',
      { clusters: [], keptClusters: [], left: [] },
      { lookupFailed: true }
    );

    expect(lines[1]).toContain('What else names the connector server is not known');
    expect(lines.join('\n')).not.toContain('Nothing else names');
  });
});

describe('bulkPlanLines', () => {
  const names = ['asdf', 'rcs', 'third'];

  test('lists the connector servers, the objects that name them and the server clusters that are left empty', () => {
    expect(
      bulkPlanLines(names, {
        references: {
          asdf: [cluster('cluster')],
          rcs: [cluster('cluster'), connector('zion')],
          third: [],
        },
        emptied: ['other'],
      })
    ).toEqual([
      'Dry run: nothing is deleted. All 3 connector servers would be deleted: asdf, rcs, third.',
      '  2 of them are named by other objects. Those objects are not changed, and they would name connector servers that do not exist afterwards:',
      "    - asdf: server cluster 'cluster' (serversList), soft",
      "    - rcs: server cluster 'cluster' (serversList), soft",
      "    - rcs: connector 'zion' (connectorRef.connectorHostRef), hard",
      "  Server cluster 'other' would have no connector server left.",
    ]);
  });

  test('the plan before a question says plan, and a connector server that nothing names is not listed', () => {
    expect(
      bulkPlanLines(['asdf'], {
        asPlan: true,
        references: { asdf: [] },
      })
    ).toEqual(['Plan: all 1 connector server would be deleted: asdf.']);
  });

  test('one connector server that is named reads as one', () => {
    const lines = bulkPlanLines(['asdf'], {
      references: { asdf: [connector('zion')] },
    });

    expect(lines[1]).toContain('1 of them is named by other objects');
  });

  test('at most 20 holders for one connector server, then how many more', () => {
    const many = Array.from({ length: 23 }, (_, index) =>
      connector(`c${index}`)
    );
    const lines = bulkPlanLines(['asdf'], { references: { asdf: many } });

    const holders = lines.filter((line) => line.startsWith('    - asdf: '));
    expect(holders).toHaveLength(21);
    expect(holders[19]).toContain("connector 'c19'");
    expect(holders[20]).toBe('    - asdf: and 3 more');
  });

  test('a lookup that could not read a source says so, and the plan goes on', () => {
    const lines = bulkPlanLines(names, {
      references: { asdf: [], rcs: [], third: [] },
      unreadable: ['the connectors'],
    });

    expect(lines[0]).toContain('would be deleted: asdf, rcs, third.');
    expect(lines.slice(1)).toEqual([
      '  What names them is not fully known: these could not be read, so the list above may be incomplete:',
      '    - the connectors',
    ]);
  });

  test('without any lookup result it lists no holder', () => {
    expect(bulkPlanLines(names)).toEqual([
      'Dry run: nothing is deleted. All 3 connector servers would be deleted: asdf, rcs, third.',
    ]);
  });
});
