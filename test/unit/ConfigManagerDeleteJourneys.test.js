import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  createHolderStubs,
  SAMPLE_REFERENCES as REF,
} from '../utils/JourneyHolderStubs.js';

/**
 * `config-manager delete journeys`: the operation behind the command
 * (`configManagerDeleteJourneys` in src/configManagerOps/FrConfigJourneysOps.ts),
 * with the library replaced by a stub that keeps the objects that can name a
 * journey in memory and records every call in order. The run tracker, the
 * cause helper, the table of what `--force` does (JourneyReferenceClearing) and
 * the module under test are real.
 *
 * What it pins, for a named delete: the journey is looked up in the list of
 * the realm and the LISTED id is what is deleted (the text that was typed never
 * reaches a request); a journey that is not there fails the command whatever
 * `--allow-failures` says; anything that still names the journey stops the
 * delete until `--force`, which clears the OAuth2 clients, SAML providers and AI
 * agents first and removes the journey from the themes (`--keep-links` leaves
 * them), then deletes, and reports what it cleared and what it left alone. A
 * dry run reads and writes nothing. For a delete of all journeys: a dry run
 * deletes nothing, orphaned nodes included; a failed orphan cleanup, a failed
 * journey and an empty realm each end as the records of failing late say.
 */

const holders = createHolderStubs(jest);
const { calls } = holders;

const readJourneys = jest.fn();
const deleteJourney = jest.fn();
const deleteJourneys = jest.fn();
const findJourneyReferences = jest.fn();
const findOrphanedNodes = jest.fn();
const removeOrphanedNodes = jest.fn();
const realmList = jest.fn();
const printMessage = jest.fn();
const printError = jest.fn();
let currentRealm;
let deployment;

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    ...holders.library,
    authn: {
      journey: {
        readJourneys,
        deleteJourney,
        deleteJourneys,
        findJourneyReferences,
        createSingleTreeExportTemplate: () => ({}),
        exportJourneys: jest.fn(),
        importJourneys: jest.fn(),
      },
      node: { findOrphanedNodes, removeOrphanedNodes },
    },
    script: { exportScript: jest.fn() },
    utils: {
      constants: {
        CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud',
        DEFAULT_REALM_KEY: '__default__realm__',
      },
      getFilePath: jest.fn(),
      saveJsonToFile: jest.fn(),
      readJsonFile: jest.fn(),
    },
  },
  state: {
    getDeploymentType: () => deployment,
    getRealm: () => currentRealm,
    setRealm: (realm) => {
      currentRealm = realm;
    },
    getVerbose: () => false,
  },
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  extractFrConfigDataToFile: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/FrConfig', () => ({
  existScript: jest.fn(),
  realmList,
  safeFileName: (name) => name,
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  debugMessage: jest.fn(),
  printError,
  printMessage,
}));

const { configManagerDeleteJourneys } =
  await import('../../src/configManagerOps/FrConfigJourneysOps');

const JOURNEY = 'ZionLogin';

/** The messages that were printed, as one text. */
const output = () =>
  printMessage.mock.calls.map(([text]) => String(text)).join('\n');
/** The level of the messages that contain `text`. */
const levelOf = (text) =>
  printMessage.mock.calls.find(([message]) =>
    String(message).includes(text)
  )?.[1];
/** What reached the tenant: the writes of holders, the deletes of journeys. */
const effects = () => calls.filter(([type]) => type !== 'read');

/** The holders of a test, stored as the library would answer a read. */
const CLIENT = {
  _id: 'zion-client',
  advancedOAuth2ClientConfig: {
    treeName: { inherited: false, value: JOURNEY },
  },
};
// a provider as AM answers a read of it: no location in it, the stub says where it is
const SAML = {
  _id: 'dXJuOnppb246c3A',
  entityId: 'urn:zion:sp',
  serviceProvider: {
    advanced: { treeConfiguration: { treeName: JOURNEY } },
  },
};
const AGENT = {
  _id: 'zion-agent',
  advancedOAuth2ClientConfig: {
    treeName: { inherited: false, value: JOURNEY },
  },
  aiAgentIdentityUid: { inherited: false, value: 'uid-1' },
};
const THEME = {
  _id: 'theme-1',
  name: 'Zion Theme',
  linkedTrees: ['Other', JOURNEY],
};

const store = () => {
  holders.stored.set(holders.key('client', 'zion-client'), CLIENT);
  holders.stored.set(holders.key('saml', 'urn:zion:sp'), SAML);
  holders.locations.set('urn:zion:sp', 'remote');
  holders.stored.set(holders.key('agent', 'zion-agent'), AGENT);
  holders.stored.set(holders.key('theme', 'theme-1'), THEME);
};

beforeEach(() => {
  jest.clearAllMocks();
  holders.stored.clear();
  holders.locations.clear();
  holders.mode.value = 'merge';
  calls.length = 0;
  currentRealm = 'before';
  deployment = 'classic';
  realmList.mockReset().mockResolvedValue(['alpha', 'bravo']);
  readJourneys
    .mockReset()
    .mockResolvedValue([{ _id: JOURNEY }, { _id: 'Registration' }]);
  findJourneyReferences.mockReset().mockResolvedValue([]);
  deleteJourney.mockReset().mockImplementation(async (id) => {
    calls.push(['delete', 'journey', id]);
    return { status: 'success', nodes: {} };
  });
  findOrphanedNodes.mockReset().mockResolvedValue([]);
  removeOrphanedNodes.mockReset().mockResolvedValue([]);
});

describe('a named delete: the journey is looked up in the list of the realm', () => {
  test('deletes the listed id, with the options of a delete that leaves the nodes to AM, and says so', async () => {
    expect(await configManagerDeleteJourneys(JOURNEY, 'alpha')).toBe(true);

    expect(deleteJourney).toHaveBeenCalledTimes(1);
    expect(deleteJourney).toHaveBeenCalledWith(JOURNEY, {
      deep: false,
      verbose: false,
      progress: false,
    });
    expect(output()).toContain(
      `Deleted journey '${JOURNEY}' in realm 'alpha'.`
    );
    expect(printError).not.toHaveBeenCalled();
  });

  test('never puts the text that was typed into a request: a path that is not in the list sends nothing but the reads', async () => {
    const hostile =
      '../../../../../../am/json/realms/root/realms/alpha/realm-config/agents/OAuth2Client/zion-client';

    expect(await configManagerDeleteJourneys(hostile, 'alpha')).toBe(false);

    expect(deleteJourney).not.toHaveBeenCalled();
    expect(effects()).toEqual([]);
    // the text was only ever compared with the list, and handed to the lookup in memory
    expect(readJourneys).toHaveBeenCalledTimes(1);
    expect(output()).toContain(
      `Journey '${hostile}' not found in realm 'alpha'.`
    );
  });

  test.each([
    ['zionlogin'],
    ['ZIONLOGIN'],
    ['ZionLogin '],
    [' ZionLogin'],
    ['Zion*'],
    // the beginning of a journey name is not the journey
    ['Zion'],
    ['ZionLogi'],
    ['Z'],
    ['Registrat'],
    // a journey name at the beginning of what was typed is not the journey either
    ['ZionLogin2'],
    ['ZionLogin/../Registration'],
  ])(
    'the match is exact and case-sensitive: %j is not a journey, nothing is deleted or written, with or without --force',
    async (typed) => {
      for (const options of [{}, { force: true }]) {
        calls.length = 0;
        deleteJourney.mockClear();

        expect(
          await configManagerDeleteJourneys(
            typed,
            'alpha',
            false,
            false,
            options
          )
        ).toBe(false);

        expect(deleteJourney).not.toHaveBeenCalled();
        expect(effects()).toEqual([]);
        expect(output()).toContain(
          `Journey '${typed}' not found in realm 'alpha'.`
        );
      }
    }
  );

  test('a journey that is not in the realm fails the command whatever --allow-failures says, and names the realm', async () => {
    expect(
      await configManagerDeleteJourneys('Nope', 'alpha', false, true)
    ).toBe(false);

    expect(output()).toContain("Journey 'Nope' not found in realm 'alpha'.");
    expect(levelOf("Journey 'Nope' not found")).toBe('error');
    expect(deleteJourney).not.toHaveBeenCalled();
  });

  test('an empty id is refused and never means all journeys', async () => {
    expect(await configManagerDeleteJourneys('', 'alpha')).toBe(false);

    expect(output()).toContain('must not be empty');
    expect(readJourneys).not.toHaveBeenCalled();
    expect(deleteJourneys).not.toHaveBeenCalled();
    expect(deleteJourney).not.toHaveBeenCalled();
  });

  test.each([[undefined], ['__default__realm__']])(
    'a named delete needs a realm: %s is refused before anything is read',
    async (realm) => {
      expect(await configManagerDeleteJourneys(JOURNEY, realm)).toBe(false);

      expect(output()).toContain('requires a realm argument');
      expect(readJourneys).not.toHaveBeenCalled();
      expect(realmList).not.toHaveBeenCalled();
    }
  );

  test('a realm whose journeys cannot be read fails the command', async () => {
    readJourneys.mockRejectedValue(new Error('read failed'));

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, true)
    ).toBe(false);

    expect(printError).toHaveBeenCalled();
    expect(deleteJourney).not.toHaveBeenCalled();
  });

  test('a delete that the library reports as failed carries the cause of the library, and --allow-failures keeps the command successful', async () => {
    deleteJourney.mockResolvedValue({
      status: 'error',
      nodes: {},
      error: new Error('AM refused: the tree is in use'),
    });

    expect(await configManagerDeleteJourneys(JOURNEY, 'alpha')).toBe(false);

    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'AM refused: the tree is in use' })
    );
    expect(output()).toContain(
      "1 of 1 step failed:\n  - delete journey 'ZionLogin': AM refused: the tree is in use"
    );

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, true)
    ).toBe(true);
    expect(output()).toContain(
      'The exit code stays 0 because --allow-failures'
    );
  });

  test('the summary of a failed delete carries the cause at the bottom of the error of the library, as the summary of a delete of all journeys does', async () => {
    deleteJourney.mockResolvedValue({
      status: 'error',
      nodes: {},
      error: Object.assign(
        new Error('Error deleting alpha realm journey ZionLogin'),
        {
          originalErrors: [
            new Error(
              'The authentication tree is in use and cannot be deleted.'
            ),
          ],
        }
      ),
    });

    expect(await configManagerDeleteJourneys(JOURNEY, 'alpha')).toBe(false);

    expect(output()).toContain(
      "1 of 1 step failed:\n  - delete journey 'ZionLogin': The authentication tree is in use and cannot be deleted."
    );
    expect(output()).not.toContain(
      "delete journey 'ZionLogin': Error deleting alpha realm journey"
    );
  });

  test('leaves the realm of the caller as it was', async () => {
    await configManagerDeleteJourneys(JOURNEY, 'alpha');
    expect(currentRealm).toBe('before');
    await configManagerDeleteJourneys(undefined, undefined, true);
    expect(currentRealm).toBe('before');
  });
});

describe('a named delete: what still names the journey stops it', () => {
  test('asks the library once, for the listed id, before anything is deleted', async () => {
    await configManagerDeleteJourneys(JOURNEY, 'alpha');

    expect(findJourneyReferences).toHaveBeenCalledTimes(1);
    expect(findJourneyReferences).toHaveBeenCalledWith(JOURNEY);
    expect(findJourneyReferences.mock.invocationCallOrder[0]).toBeLessThan(
      deleteJourney.mock.invocationCallOrder[0]
    );
  });

  test.each(Object.entries(REF))(
    '%s: a reference stops the delete, names the holder, its field and the dependency, and deletes and writes nothing',
    async (source, reference) => {
      store();
      findJourneyReferences.mockResolvedValue([reference]);

      expect(await configManagerDeleteJourneys(JOURNEY, 'alpha')).toBe(false);

      expect(effects()).toEqual([]);
      expect(deleteJourney).not.toHaveBeenCalled();
      const text = output();
      expect(text).toContain(
        `Journey '${JOURNEY}' in realm 'alpha' is still named by:`
      );
      expect(text).toContain(`, ${reference.dependency}`);
      expect(text).toContain('Nothing was deleted. --force deletes it anyway');
      expect(levelOf('is still named by')).toBe('error');
    }
  );

  test('--allow-failures does not turn a refusal into success', async () => {
    findJourneyReferences.mockResolvedValue([REF.theme]);

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, true)
    ).toBe(false);
    expect(deleteJourney).not.toHaveBeenCalled();
  });

  test('--keep-links without --force does not turn a soft link into permission', async () => {
    findJourneyReferences.mockResolvedValue([REF.theme]);

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, {
        keepLinks: true,
      })
    ).toBe(false);
    expect(deleteJourney).not.toHaveBeenCalled();
  });

  test('a lookup that could not read every source refuses and names the sources', async () => {
    findJourneyReferences.mockRejectedValue(
      Object.assign(new Error('Error finding references'), {
        originalErrors: [new Error('Error reading OAuth2 clients')],
      })
    );

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, true)
    ).toBe(false);

    expect(output()).toContain(
      "Cannot tell what still names journey 'ZionLogin' in realm 'alpha': these could not be read:\n  - Error reading OAuth2 clients"
    );
    expect(output()).toContain(
      '--force deletes the journey without that check'
    );
    expect(deleteJourney).not.toHaveBeenCalled();
  });

  test('--force goes ahead after a lookup that failed, after saying what could not be checked, and clears nothing', async () => {
    findJourneyReferences.mockRejectedValue(
      Object.assign(new Error('Error finding references'), {
        originalErrors: [new Error('Error reading policies')],
      })
    );

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, {
        force: true,
      })
    ).toBe(true);

    expect(output()).toContain('  - Error reading policies');
    expect(output()).toContain('the journey is deleted without that check');
    expect(effects()).toEqual([['delete', 'journey', JOURNEY]]);
  });

  test('a journey that is not there but is still named by an AI agent says so and how to repair it', async () => {
    findJourneyReferences.mockResolvedValue([
      { ...REF['ai-agent'], id: 'zion-agent' },
    ]);
    readJourneys.mockResolvedValue([]);

    expect(await configManagerDeleteJourneys(JOURNEY, 'alpha')).toBe(false);

    const text = output();
    expect(text).toContain(`Journey '${JOURNEY}' not found in realm 'alpha'.`);
    expect(text).toContain("AI agent 'zion-agent'");
    expect(text).toContain('can no longer be updated or deleted');
    expect(text).toContain('create a journey with that name');
    expect(effects()).toEqual([]);
  });

  test('a journey that is not there says nothing more when nothing names it, or when the lookup fails', async () => {
    readJourneys.mockResolvedValue([]);

    await configManagerDeleteJourneys(JOURNEY, 'alpha');
    findJourneyReferences.mockRejectedValue(new Error('boom'));
    await configManagerDeleteJourneys(JOURNEY, 'alpha');

    expect(output()).not.toContain('Still named');
  });
});

describe('a named delete with --force', () => {
  const force = { force: true };

  test('clears the OAuth2 client, the SAML provider and the AI agent, in that order, removes the journey from the theme, and only then deletes it', async () => {
    store();
    findJourneyReferences.mockResolvedValue([
      REF['oauth2-client'],
      REF['saml2-provider'],
      REF['ai-agent'],
      REF.theme,
    ]);

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
    ).toBe(true);

    expect(effects()).toEqual([
      [
        'write',
        'client',
        'zion-client',
        {
          ...CLIENT,
          advancedOAuth2ClientConfig: {
            treeName: { inherited: false, value: '[Empty]' },
          },
        },
      ],
      [
        'write',
        'saml',
        'remote',
        {
          ...SAML,
          serviceProvider: {
            advanced: { treeConfiguration: { treeName: '[Empty]' } },
          },
        },
      ],
      [
        'write',
        'agent',
        'zion-agent',
        // the whole agent as it was read, with only the field changed
        {
          ...AGENT,
          advancedOAuth2ClientConfig: {
            treeName: { inherited: false, value: '[Empty]' },
          },
        },
        false,
      ],
      ['write', 'theme', 'theme-1', { ...THEME, linkedTrees: ['Other'] }],
      ['delete', 'journey', JOURNEY],
    ]);
    const text = output();
    expect(text).toContain(
      "Cleared the journey in OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName) (it held 'ZionLogin')."
    );
    expect(text).toContain(
      "Cleared the journey in SAML provider 'urn:zion:sp'"
    );
    expect(text).toContain("Cleared the journey in AI agent 'zion-agent'");
    expect(text).toContain(
      "Removed journey 'ZionLogin' from theme 'Zion Theme' (linkedTrees) (the list held 'Other, ZionLogin')."
    );
    expect(text).toContain("Deleted journey 'ZionLogin' in realm 'alpha'.");
  });

  test('leaves every other holder alone, and says that they now name a journey that does not exist', async () => {
    store();
    const others = [
      REF.journey,
      REF['authentication-settings'],
      REF['self-service-trees'],
      REF['oauth2-provider'],
      REF['agent-group'],
      REF['cimd-profile'],
      REF.policy,
    ];
    findJourneyReferences.mockResolvedValue(others);

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
    ).toBe(true);

    // nothing of theirs is written: the only effect is the delete
    expect(effects()).toEqual([['delete', 'journey', JOURNEY]]);
    const text = output();
    expect(text).toContain(
      'Left alone, these now name a journey that does not exist:'
    );
    for (const reference of others) {
      expect(text).toContain(
        reference.source === 'journey'
          ? reference.journeyId
          : (reference.name ?? reference.id ?? reference.from)
      );
    }
    expect(levelOf('Left alone')).toBe('warn');
  });

  test('a holder that only inherits the name is left alone, not written', async () => {
    store();
    findJourneyReferences.mockResolvedValue([
      { ...REF['ai-agent'], inherited: true },
    ]);

    await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force);

    expect(effects()).toEqual([['delete', 'journey', JOURNEY]]);
    expect(output()).toContain('inherited from its group');
  });

  test('--keep-links leaves the link of the theme, says so, and still clears the client', async () => {
    store();
    findJourneyReferences.mockResolvedValue([REF['oauth2-client'], REF.theme]);

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, {
        force: true,
        keepLinks: true,
      })
    ).toBe(true);

    expect(
      effects().map(([type, holderType]) => `${type} ${holderType}`)
    ).toEqual(['write client', 'delete journey']);
    expect(output()).toContain(
      "Kept the link of the journey in these themes (--keep-links):\n  - theme 'Zion Theme' (linkedTrees)"
    );
  });

  test('a clearing that fails stops the run: nothing is deleted, the failure is named with its cause, and --allow-failures does not turn it into success', async () => {
    store();
    findJourneyReferences.mockResolvedValue([
      REF['oauth2-client'],
      REF['ai-agent'],
      REF.theme,
    ]);
    holders.library.oauth2oidc.client.updateOAuth2Client.mockRejectedValueOnce(
      new Error('AM said no')
    );

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, true, force)
    ).toBe(false);

    // the AI agent and the theme were not touched, and the journey is still there
    expect(effects()).toEqual([]);
    expect(deleteJourney).not.toHaveBeenCalled();
    const text = output();
    expect(text).toContain(
      "1 of 4 steps failed, 3 not attempted:\n  - clear the journey in OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName): AM said no"
    );
    expect(text).toContain("  - delete journey 'ZionLogin' (not attempted)");
    expect(text).toContain('does not apply to that');
  });

  test('a holder that does not read back as cleared stops the run before the delete', async () => {
    store();
    findJourneyReferences.mockResolvedValue([REF['oauth2-client']]);
    holders.library.oauth2oidc.client.updateOAuth2Client.mockImplementationOnce(
      async () => {}
    );

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
    ).toBe(false);

    expect(deleteJourney).not.toHaveBeenCalled();
    expect(output()).toContain(
      'still holds the journey name after it was cleared'
    );
  });

  test('a delete that AM still refuses fails, names the cause, and says what still names the journey', async () => {
    store();
    findJourneyReferences
      .mockResolvedValueOnce([REF['oauth2-client']])
      .mockResolvedValueOnce([REF['saml2-provider']]);
    deleteJourney.mockResolvedValue({
      status: 'error',
      nodes: {},
      error: new Error(
        'The authentication tree is in use and cannot be deleted.'
      ),
    });

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
    ).toBe(false);

    const text = output();
    expect(text).toContain(
      "delete journey 'ZionLogin': The authentication tree is in use and cannot be deleted."
    );
    expect(text).toContain("Still named by:\n  - SAML provider 'urn:zion:sp'");
    expect(findJourneyReferences).toHaveBeenCalledTimes(2);
  });

  test('a theme unlink that fails stops the run before the delete, says that the clearing that was done stays, and --allow-failures does not turn it into success', async () => {
    store();
    findJourneyReferences.mockResolvedValue([REF['oauth2-client'], REF.theme]);
    holders.library.theme.updateTheme.mockRejectedValueOnce(
      new Error('theme write refused')
    );

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, true, force)
    ).toBe(false);

    // the client was cleared, the journey is still there
    expect(
      effects().map(([type, holderType]) => `${type} ${holderType}`)
    ).toEqual(['write client']);
    expect(deleteJourney).not.toHaveBeenCalled();
    const text = output();
    expect(text).toContain(
      "1 of 3 steps failed, 1 not attempted:\n  - remove the journey from theme 'Zion Theme' (linkedTrees): theme write refused\n  - delete journey 'ZionLogin' (not attempted)"
    );
    expect(text).toContain('does not apply to that');
    expect(text).toContain("Journey 'ZionLogin' was not deleted.");
    expect(text).toContain(
      "Changed before, and they stay changed: OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName)."
    );
    expect(text).toContain(
      "To undo, set the journey 'ZionLogin' in each of them again."
    );
  });

  test('a second clearing that fails says that the first stays cleared', async () => {
    store();
    findJourneyReferences.mockResolvedValue([
      REF['oauth2-client'],
      REF['ai-agent'],
    ]);
    holders.library.agent.updateAIAgent.mockRejectedValueOnce(
      new Error('AM said no')
    );

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
    ).toBe(false);

    expect(deleteJourney).not.toHaveBeenCalled();
    expect(output()).toContain(
      "Changed before, and they stay changed: OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName)."
    );
    // nothing was changed before the first clearing: no such message
    jest.clearAllMocks();
    holders.stored.clear();
    store();
    holders.library.oauth2oidc.client.updateOAuth2Client.mockRejectedValueOnce(
      new Error('AM said no')
    );
    await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force);
    expect(output()).not.toContain('stay changed');
  });

  test('a delete that fails after a holder was cleared follows --allow-failures like any failed operation (exit 1 without it, 0 with it), and the output says that the holder stays cleared and how to undo it', async () => {
    store();
    findJourneyReferences.mockResolvedValue([REF['oauth2-client']]);
    deleteJourney.mockResolvedValue({
      status: 'error',
      nodes: {},
      error: new Error('AM refused the delete'),
    });

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
    ).toBe(false);
    expect(output()).toContain(
      "delete journey 'ZionLogin': AM refused the delete"
    );
    expect(output()).not.toContain('The exit code stays 0');
    expect(output()).not.toContain('depend on');

    jest.clearAllMocks();
    holders.stored.clear();
    store();
    calls.length = 0;
    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, true, force)
    ).toBe(true);

    const text = output();
    expect(text).toContain(
      'The exit code stays 0 because --allow-failures was given.'
    );
    // the run did not stop because of a step that others depend on: the delete is the last step
    expect(text).not.toContain('depend on');
    expect(text).toContain("Journey 'ZionLogin' was not deleted.");
    expect(text).toContain(
      "Changed before, and they stay changed: OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName)."
    );
    expect(text).toContain(
      "To undo, set the journey 'ZionLogin' in each of them again. To finish, run the command again"
    );
  });

  describe('a step that fails after it wrote its holder', () => {
    /** A write that drops what it does not understand: the agent loses its identity. */
    const damagingWrite = () =>
      holders.library.agent.updateAIAgent.mockImplementationOnce(
        async (id, data) => {
          calls.push(['write', 'agent', id, structuredClone(data), false]);
          const { aiAgentIdentityUid, ...kept } = data;
          holders.stored.set(holders.key('agent', id), {
            ...kept,
            _rev: 'damaged',
          });
        }
      );

    test('is listed as changed and NOT restored, next to the holders that stay changed, when the restore fails', async () => {
      store();
      findJourneyReferences.mockResolvedValue([
        REF['oauth2-client'],
        REF['ai-agent'],
      ]);
      damagingWrite();
      holders.library.agent.updateAIAgent.mockRejectedValueOnce(
        new Error('AM said no')
      );

      expect(
        await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
      ).toBe(false);

      expect(deleteJourney).not.toHaveBeenCalled();
      const text = output();
      expect(text).toContain("Journey 'ZionLogin' was not deleted.");
      expect(text).toContain(
        "Changed before, and they stay changed: OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName)."
      );
      expect(text).toContain(
        "Changed by the step that failed, and NOT restored: AI agent 'zion-agent' (advancedOAuth2ClientConfig.treeName)."
      );
      // the holder that failed is not among the ones that were cleared
      expect(text).not.toContain(
        "Cleared the journey in AI agent 'zion-agent'"
      );
    });

    test('is not listed when it was written back as it was before', async () => {
      store();
      findJourneyReferences.mockResolvedValue([REF['ai-agent']]);
      damagingWrite();

      expect(
        await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
      ).toBe(false);

      expect(deleteJourney).not.toHaveBeenCalled();
      expect(output()).toContain('written back as it was before');
      expect(output()).not.toContain('NOT restored');
      expect(output()).not.toContain('stay changed');
      expect(output()).not.toContain("Journey 'ZionLogin' was not deleted.");
    });

    test('is listed as NOT restored when the read after the write fails', async () => {
      store();
      findJourneyReferences.mockResolvedValue([REF['oauth2-client']]);
      holders.library.oauth2oidc.client.readOAuth2Client
        .mockImplementationOnce(
          holders.library.oauth2oidc.client.readOAuth2Client.getMockImplementation()
        )
        .mockRejectedValueOnce(new Error('read refused'));

      expect(
        await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
      ).toBe(false);

      expect(deleteJourney).not.toHaveBeenCalled();
      expect(output()).toContain(
        "Changed by the step that failed, and NOT restored: OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName)."
      );
      expect(output()).not.toContain('they stay changed');
    });

    test('is listed as NOT restored for a theme whose read after the write fails', async () => {
      store();
      findJourneyReferences.mockResolvedValue([REF.theme]);
      holders.library.theme.readTheme
        .mockImplementationOnce(
          holders.library.theme.readTheme.getMockImplementation()
        )
        .mockRejectedValueOnce(new Error('read refused'));

      expect(
        await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
      ).toBe(false);

      expect(output()).toContain(
        "Changed by the step that failed, and NOT restored: theme 'Zion Theme' (linkedTrees)."
      );
    });
  });

  test('a delete that fails when nothing was changed before keeps --allow-failures: it ends with 0 and says nothing about changed holders', async () => {
    deleteJourney.mockResolvedValue({
      status: 'error',
      nodes: {},
      error: new Error('AM refused the delete'),
    });

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, true, force)
    ).toBe(true);

    expect(output()).toContain(
      'The exit code stays 0 because --allow-failures'
    );
    expect(output()).not.toContain('stay changed');
  });

  test('without references --force simply deletes, and writes nothing', async () => {
    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', false, false, force)
    ).toBe(true);

    expect(effects()).toEqual([['delete', 'journey', JOURNEY]]);
    expect(output()).not.toContain('Left alone');
  });
});

describe('a named dry run', () => {
  const force = { force: true };

  test('with --force reads and writes nothing, deletes nothing, and says what would be cleared, removed, kept and left', async () => {
    store();
    findJourneyReferences.mockResolvedValue([
      REF['oauth2-client'],
      REF['ai-agent'],
      REF.theme,
      REF.policy,
    ]);

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', true, false, force)
    ).toBe(true);

    expect(calls).toEqual([]);
    expect(deleteJourney).not.toHaveBeenCalled();
    expect(output()).toBe(
      [
        "Dry run: would delete journey 'ZionLogin' in realm 'alpha'.",
        '  Before that, clear the journey in these:',
        "    - OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName)",
        "    - AI agent 'zion-agent' (advancedOAuth2ClientConfig.treeName)",
        '  Before that, remove the journey from the list of journeys of these themes (--keep-links leaves it):',
        "    - theme 'Zion Theme' (linkedTrees)",
        '  Leave these alone, they would name a journey that does not exist afterwards:',
        "    - policy 'Zion Policy' of policy set 'zionApplication' (condition.authenticateToService), hard",
      ].join('\n')
    );
  });

  test('with --force --keep-links says that the theme link is kept', async () => {
    findJourneyReferences.mockResolvedValue([REF.theme]);

    await configManagerDeleteJourneys(JOURNEY, 'alpha', true, false, {
      force: true,
      keepLinks: true,
    });

    expect(output()).toContain('Keep the link in these themes (--keep-links):');
    expect(output()).not.toContain('remove the journey from');
  });

  describe('the plan before the question of --force (a dry run that says so)', () => {
    const plan = { force: true, plan: true };

    test('says plan and not dry run, and lists what would be changed', async () => {
      store();
      findJourneyReferences.mockResolvedValue([REF['oauth2-client']]);

      expect(
        await configManagerDeleteJourneys(JOURNEY, 'alpha', true, false, plan)
      ).toBe(true);

      expect(output()).toContain(
        "Plan: journey 'ZionLogin' in realm 'alpha' would be deleted."
      );
      expect(output()).toContain(
        "    - OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName)"
      );
      expect(output()).not.toContain('Dry run');
      expect(calls.filter(([type]) => type !== 'read')).toEqual([]);
      expect(deleteJourney).not.toHaveBeenCalled();
    });

    test('says that no other object is changed when nothing names the journey', async () => {
      expect(
        await configManagerDeleteJourneys(JOURNEY, 'alpha', true, false, plan)
      ).toBe(true);

      expect(output()).toContain(
        'Nothing else names the journey: no other object is changed.'
      );
      expect(output()).not.toContain('Dry run');
    });

    test('says what could not be checked when the lookup failed', async () => {
      findJourneyReferences.mockRejectedValue(
        Object.assign(new Error('Error finding references'), {
          originalErrors: [new Error('Error reading policies')],
        })
      );

      expect(
        await configManagerDeleteJourneys(JOURNEY, 'alpha', true, false, plan)
      ).toBe(true);

      expect(output()).toContain('  - Error reading policies');
      expect(output()).toContain(
        'What else names the journey is not known: not every source could be read, so nothing is cleared.'
      );
      expect(output()).not.toContain('Nothing else names the journey');
      expect(output()).not.toContain('Dry run');
    });

    test('a dry run that is not a plan keeps saying dry run', async () => {
      await configManagerDeleteJourneys(JOURNEY, 'alpha', true, false, force);

      expect(output()).toContain(
        "Dry run: would delete journey 'ZionLogin' in realm 'alpha'."
      );
      expect(output()).not.toContain('Plan:');
    });
  });

  test('a source that could not be read is named with its cause, not by its name only', async () => {
    findJourneyReferences.mockRejectedValue(
      Object.assign(new Error('Error finding references'), {
        originalErrors: [
          Object.assign(new Error('Error reading themes'), {
            originalErrors: [new Error('Request failed with status code 500')],
          }),
        ],
      })
    );

    expect(await configManagerDeleteJourneys(JOURNEY, 'alpha')).toBe(false);

    expect(output()).toContain(
      '  - Error reading themes: Request failed with status code 500'
    );
  });

  test('with --force and a lookup that could not read every source says "would be deleted", and that what else names the journey is not known', async () => {
    findJourneyReferences.mockRejectedValue(
      Object.assign(new Error('Error finding references'), {
        originalErrors: [new Error('Error reading policies')],
      })
    );

    expect(
      await configManagerDeleteJourneys(JOURNEY, 'alpha', true, false, force)
    ).toBe(true);

    const text = output();
    expect(text).toContain('  - Error reading policies');
    expect(text).toContain('the journey would be deleted without that check');
    expect(text).not.toContain('is deleted without that check');
    expect(text).toContain(
      "Dry run: would delete journey 'ZionLogin' in realm 'alpha'."
    );
    expect(text).toContain('What else names the journey is not known');
    expect(text).not.toContain('nothing else names the journey');
    expect(calls).toEqual([]);
    expect(deleteJourney).not.toHaveBeenCalled();
  });

  test('without --force predicts the refusal: it names what names the journey and fails, as the delete would', async () => {
    findJourneyReferences.mockResolvedValue([REF['oauth2-client']]);

    expect(await configManagerDeleteJourneys(JOURNEY, 'alpha', true)).toBe(
      false
    );

    expect(output()).toContain('Dry run: the delete would be refused.');
    expect(deleteJourney).not.toHaveBeenCalled();
  });

  test('of a journey that nothing names says so, and deletes nothing', async () => {
    expect(await configManagerDeleteJourneys(JOURNEY, 'alpha', true)).toBe(
      true
    );

    expect(output()).toContain("Dry run: would delete journey 'ZionLogin'");
    expect(output()).toContain('nothing else names the journey');
    expect(calls).toEqual([]);
  });

  test('of a journey that is not there fails as the delete would', async () => {
    expect(await configManagerDeleteJourneys('Nope', 'alpha', true)).toBe(
      false
    );

    expect(output()).toContain("Journey 'Nope' not found in realm 'alpha'.");
  });
});

describe('a delete of all journeys', () => {
  const ORPHANS = [
    { _id: 'orphan-1', _type: { _id: 'SetStateNode', version: '1.0' } },
    { _id: 'orphan-2', _type: { _id: 'PageNode' } },
  ];
  const statuses = (...ids) =>
    Object.fromEntries(ids.map((id) => [id, { status: 'success', nodes: {} }]));

  test('a dry run deletes nothing: no journey, no node, no write', async () => {
    findOrphanedNodes.mockResolvedValue(ORPHANS);

    expect(await configManagerDeleteJourneys(undefined, 'alpha', true)).toBe(
      true
    );

    expect(deleteJourneys).not.toHaveBeenCalled();
    expect(deleteJourney).not.toHaveBeenCalled();
    expect(removeOrphanedNodes).not.toHaveBeenCalled();
    expect(effects()).toEqual([]);
    // it only read: the journeys and the orphaned nodes that exist now
    expect(readJourneys).toHaveBeenCalledTimes(1);
    expect(findOrphanedNodes).toHaveBeenCalledTimes(1);
  });

  test('a dry run says "would", lists the journeys and the orphaned nodes, and counts both', async () => {
    findOrphanedNodes.mockResolvedValue(ORPHANS);

    await configManagerDeleteJourneys(undefined, 'alpha', true);

    const text = output();
    expect(text).toContain(
      "Dry run: would delete journey 'ZionLogin' in realm 'alpha'."
    );
    expect(text).toContain(
      "Dry run: would delete journey 'Registration' in realm 'alpha'."
    );
    expect(text).toContain(
      "Dry run: would delete orphaned node 'orphan-1' (SetStateNode 1.0) in realm 'alpha'."
    );
    expect(text).toContain(
      "Dry run: would delete orphaned node 'orphan-2' (PageNode) in realm 'alpha'."
    );
    expect(text).toContain('Journeys that would be deleted: 2');
    expect(text).toContain('Orphaned nodes that would be deleted: 2');
    expect(text).toContain(
      'the journeys that the realm uses for login included'
    );
    expect(text).not.toContain('Deleted');
  });

  test('a delete removes the journeys, then the orphaned nodes, tells what it deleted, and counts it', async () => {
    deleteJourneys.mockResolvedValue(statuses(JOURNEY, 'Registration'));
    findOrphanedNodes.mockResolvedValue(ORPHANS);

    expect(await configManagerDeleteJourneys(undefined, 'alpha')).toBe(true);

    expect(deleteJourneys).toHaveBeenCalledWith({
      deep: false,
      verbose: false,
    });
    expect(removeOrphanedNodes).toHaveBeenCalledTimes(1);
    expect(removeOrphanedNodes.mock.calls[0][0]).toEqual(ORPHANS);
    const text = output();
    expect(text).toContain("Deleted journey 'ZionLogin' in realm 'alpha'.");
    expect(text).toContain(
      "Deleted orphaned node 'orphan-1' (SetStateNode 1.0) in realm 'alpha'."
    );
    expect(text).toContain('Journeys deleted: 2');
    expect(text).toContain('Orphaned nodes deleted: 2');
    // the journeys were deleted before the orphaned nodes were looked for
    expect(deleteJourneys.mock.invocationCallOrder[0]).toBeLessThan(
      findOrphanedNodes.mock.invocationCallOrder[0]
    );
  });

  test('a failed orphan cleanup fails the command, names the failure, and --allow-failures keeps it successful', async () => {
    deleteJourneys.mockResolvedValue(statuses(JOURNEY));
    findOrphanedNodes.mockRejectedValue(new Error('node types failed'));

    expect(await configManagerDeleteJourneys(undefined, 'alpha')).toBe(false);

    expect(printError).toHaveBeenCalled();
    expect(output()).toContain(
      "1 of 2 deletions failed:\n  - the orphaned nodes of realm 'alpha': node types failed"
    );

    expect(
      await configManagerDeleteJourneys(undefined, 'alpha', false, true)
    ).toBe(true);
  });

  test('an orphaned node that cannot be deleted fails the command and is named', async () => {
    deleteJourneys.mockResolvedValue(statuses(JOURNEY));
    findOrphanedNodes.mockResolvedValue(ORPHANS);
    removeOrphanedNodes.mockImplementation(async (nodes, callback) => {
      callback(undefined, nodes[0]);
      callback(new Error('Failed to delete orphaned node orphan-2'), undefined);
      return [nodes[1]];
    });

    expect(await configManagerDeleteJourneys(undefined, 'alpha')).toBe(false);

    const text = output();
    expect(text).toContain("Deleted orphaned node 'orphan-1'");
    expect(text).not.toContain("Deleted orphaned node 'orphan-2'");
    expect(text).toContain('Orphaned nodes deleted: 1');
    expect(text).toContain('Failed to delete orphaned node orphan-2');
  });

  test('a journey that cannot be deleted fails the command, the others are still deleted, and every failure of the realm is in the summary with the cause of the library', async () => {
    deleteJourneys.mockResolvedValue({
      Login: {
        status: 'error',
        nodes: {},
        error: new Error('AM refused Login'),
      },
      [JOURNEY]: { status: 'success', nodes: {} },
      Registration: {
        status: 'error',
        nodes: {},
        error: new Error('AM refused Registration'),
      },
    });

    expect(await configManagerDeleteJourneys(undefined, 'alpha')).toBe(false);

    const text = output();
    expect(text).toContain("Deleted journey 'ZionLogin' in realm 'alpha'.");
    expect(text).toContain('Journeys deleted: 1');
    expect(text).toContain(
      "2 of 3 deletions failed:\n  - journey 'Login' in realm 'alpha': AM refused Login\n  - journey 'Registration' in realm 'alpha': AM refused Registration"
    );
    // the orphaned nodes are looked for although a journey failed
    expect(findOrphanedNodes).toHaveBeenCalledTimes(1);
  });

  test('a journey that failed does not count as deleted, and --allow-failures keeps the command successful', async () => {
    deleteJourneys.mockResolvedValue({
      Login: { status: 'error', nodes: {}, error: new Error('AM refused') },
    });

    expect(
      await configManagerDeleteJourneys(undefined, 'alpha', false, true)
    ).toBe(true);
    expect(output()).toContain('Journeys deleted: 0');
  });

  test('a realm without journeys says so, and is a success', async () => {
    deleteJourneys.mockResolvedValue({});

    expect(await configManagerDeleteJourneys(undefined, 'alpha')).toBe(true);

    expect(output()).toContain("No journeys found to delete in realm 'alpha'.");
    expect(levelOf('No journeys found')).toBe('warn');
  });

  test('an empty realm says so in a dry run too', async () => {
    readJourneys.mockResolvedValue([]);

    expect(await configManagerDeleteJourneys(undefined, 'alpha', true)).toBe(
      true
    );

    expect(output()).toContain("No journeys found to delete in realm 'alpha'.");
  });

  test('every realm is processed when none is given, and a realm that fails does not stop the others', async () => {
    deleteJourneys
      .mockRejectedValueOnce(new Error('cannot list the journeys of alpha'))
      .mockResolvedValueOnce(statuses('Login'));

    expect(await configManagerDeleteJourneys(undefined, undefined)).toBe(false);

    expect(realmList).toHaveBeenCalledTimes(1);
    expect(deleteJourneys).toHaveBeenCalledTimes(2);
    expect(output()).toContain("Deleted journey 'Login' in realm 'bravo'.");
    expect(output()).toContain(
      "the journeys of realm 'alpha': cannot list the journeys of alpha"
    );
  });

  test('a realm list that cannot be read fails the command whatever --allow-failures says', async () => {
    realmList.mockRejectedValue(new Error('realms failed'));

    expect(
      await configManagerDeleteJourneys(undefined, undefined, false, true)
    ).toBe(false);
    expect(deleteJourneys).not.toHaveBeenCalled();
  });

  test('the root realm of a Cloud tenant is skipped', async () => {
    deployment = 'cloud';
    realmList.mockResolvedValue(['/', 'alpha']);
    deleteJourneys.mockResolvedValue(statuses('Login'));

    await configManagerDeleteJourneys(undefined, undefined);

    expect(deleteJourneys).toHaveBeenCalledTimes(1);
    // the skip is said once, and nothing is done in the root realm
    expect(output()).toContain(
      'The root realm (/) is skipped on a Cloud tenant.'
    );
    expect(output()).not.toContain("realm '/'");
  });

  test('the root realm of another deployment is not reported as skipped', async () => {
    deployment = 'forgeops';
    realmList.mockResolvedValue(['/']);
    deleteJourneys.mockResolvedValue(statuses('Login'));

    await configManagerDeleteJourneys(undefined, undefined);

    expect(output()).not.toContain('is skipped');
  });

  test('the root realm of another deployment is processed', async () => {
    deployment = 'forgeops';
    realmList.mockResolvedValue(['/']);
    deleteJourneys.mockResolvedValue(statuses('Login'));

    await configManagerDeleteJourneys(undefined, undefined);

    expect(deleteJourneys).toHaveBeenCalledTimes(1);
  });
});
