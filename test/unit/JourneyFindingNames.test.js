import { frodo, state } from '@rockcarver/frodo-lib';
import { findingLine } from '../../src/ops/utils/JourneyFindingLabels.ts';

// A finding of `journey validate` names its nodes as the Journey Editor shows them (cli#1378). The words
// are made from the message of the library by replacing the ids that it quotes, so this test runs the REAL
// library, offline, over a journey export that has a case for every finding code, and writes each finding
// with the real `findingLine`. If a later wording of the library stops quoting an id, or stops describing a
// node, a line here shows a UUID again. The words of each pattern, with stub findings, are in
// JourneyFindingLabels.test.js.

const id = (number) =>
  `${number.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
const PAGE = id(0xab9f607b);
const AGE = id(0x295a70ba);
const USER = id(0x5d0d6a14);
const PASS = id(0x44444444);
const LOCKOUT = id(0xa1b2c3d4);
const STRAY = id(0x57a47001);
const LOOSE = id(0x100531d0);
const PAGE_TWO = id(0xab9f607c);
const MAIL = id(0x3a110001);
const IDP = id(0xe165f3c7);
const IDP_TWO = id(0xe165f3c8);
const SAML = id(0x5a410001);
const NOWHERE = id(0xdeadbeef);
const SUCCESS = '70e691a5-1e33-4ac3-a356-e7b6d60d92e0';

/** A valid journey: the Page Node "Login Page" (children "Username" and "Password") and the decision "Check Age". */
function loginJourney(journeyId) {
  return {
    tree: {
      _id: journeyId,
      entryNodeId: PAGE,
      nodes: {
        [PAGE]: {
          displayName: 'Login Page',
          nodeType: 'PageNode',
          connections: { outcome: AGE },
        },
        [AGE]: {
          displayName: 'Check Age',
          nodeType: 'ScriptedDecisionNode',
          connections: { true: SUCCESS, false: SUCCESS },
        },
      },
      staticNodes: { [SUCCESS]: {} },
    },
    nodes: {
      [PAGE]: {
        _id: PAGE,
        _type: { _id: 'PageNode', name: 'Page Node', version: '1.0' },
        _outcomes: [{ id: 'outcome' }],
        nodes: [
          {
            _id: USER,
            displayName: 'Username',
            nodeType: 'ValidatedUsernameNode',
          },
          {
            _id: PASS,
            displayName: 'Password',
            nodeType: 'ValidatedPasswordNode',
          },
        ],
      },
      [AGE]: {
        _id: AGE,
        _type: { _id: 'ScriptedDecisionNode', name: 'Scripted Decision' },
        _outcomes: [{ id: 'true' }, { id: 'false' }],
        script: 'script-1',
      },
    },
    innerNodes: {
      [USER]: {
        _id: USER,
        _type: { _id: 'ValidatedUsernameNode', name: 'Platform Username' },
        _outcomes: [{ id: 'outcome' }],
      },
      [PASS]: {
        _id: PASS,
        _type: { _id: 'ValidatedPasswordNode', name: 'Platform Password' },
        _outcomes: [{ id: 'outcome' }],
      },
    },
  };
}

function addTreeNode(journey, nodeId, displayName, nodeType, nodeTypeName) {
  journey.tree.nodes[nodeId] = { displayName, nodeType, connections: {} };
  journey.nodes[nodeId] = {
    _id: nodeId,
    _type: { _id: nodeType, name: nodeTypeName },
    _outcomes: [],
  };
}

/** The cases: a code, how to break the valid journey so that the library reports it, and the line it must give. */
const CASES = [
  {
    code: 'MISSING_NODE_DEFINITION',
    break: (journey) => delete journey.nodes[AGE],
    lines: [
      '  [MISSING_NODE_DEFINITION] Tree node "Check Age" has no node definition (ScriptedDecisionNode)',
    ],
  },
  {
    code: 'NODE_ID_MISMATCH',
    break: (journey) => (journey.nodes[AGE]._id = 'renamed'),
    lines: [
      `  [NODE_ID_MISMATCH] Node definition key '${AGE}' does not match _id 'renamed'`,
    ],
  },
  {
    code: 'MISSING_CONNECTION_TARGET',
    break: (journey) => (journey.tree.nodes[AGE].connections.true = NOWHERE),
    lines: [
      `  [MISSING_CONNECTION_TARGET] Connection from node "Check Age" (Scripted Decision) targets missing graph node '${NOWHERE}'`,
    ],
  },
  {
    code: 'MISSING_ENTRY_NODE',
    break: (journey) => (journey.tree.entryNodeId = NOWHERE),
    lines: [
      `  [MISSING_ENTRY_NODE] Entry node '${NOWHERE}' does not resolve to a graph node`,
    ],
  },
  {
    code: 'MISSING_INNER_NODE',
    break: (journey) => delete journey.innerNodes[USER],
    lines: [
      '  [MISSING_INNER_NODE] Page Node "Login Page" references missing inner node "Username" (ValidatedUsernameNode)',
    ],
  },
  {
    code: 'UNKNOWN_CONNECTION_OUTCOME',
    break: (journey) => (journey.tree.nodes[AGE].connections.maybe = SUCCESS),
    lines: [
      '  [UNKNOWN_CONNECTION_OUTCOME] Connection outcome \'maybe\' is not declared by node "Check Age" (Scripted Decision)',
    ],
  },
  {
    code: 'UNCONNECTED_OUTCOME',
    break: (journey) => delete journey.tree.nodes[AGE].connections.false,
    lines: [
      '  [UNCONNECTED_OUTCOME] Declared outcome \'false\' on node "Check Age" (Scripted Decision) has no connection',
    ],
  },
  {
    code: 'UNREACHABLE_NODE',
    break: (journey) =>
      addTreeNode(
        journey,
        LOCKOUT,
        'Account Lockout',
        'AccountLockoutNode',
        'Account Lockout'
      ),
    lines: [
      '  [UNREACHABLE_NODE] Tree node "Account Lockout" is not reachable from the entry node',
    ],
  },
  {
    code: 'UNREFERENCED_INNER_NODE',
    break: (journey) =>
      (journey.innerNodes[STRAY] = {
        _id: STRAY,
        _type: { _id: 'ValidatedPasswordNode', name: 'Platform Password' },
      }),
    lines: [
      '  [UNREFERENCED_INNER_NODE] Inner node (Platform Password, id 57a47001) is not referenced by a Page Node',
    ],
  },
  {
    code: 'UNREPRESENTED_NODE',
    break: (journey) =>
      (journey.nodes[LOOSE] = {
        _id: LOOSE,
        _type: { _id: 'ScriptedDecisionNode', name: 'Scripted Decision' },
      }),
    lines: [
      '  [UNREPRESENTED_NODE] Node definition (Scripted Decision, id 100531d0) is not represented in tree.nodes',
    ],
  },
  {
    code: 'PAGE_NODE_OUTCOME_MISMATCH',
    break: (journey) => (journey.nodes[PAGE]._outcomes = []),
    lines: [
      '  [PAGE_NODE_OUTCOME_MISMATCH] Page Node "Login Page" is missing exposed outcome \'outcome\'',
    ],
  },
  {
    code: 'NO_REACHABLE_TERMINAL',
    break: (journey) =>
      (journey.tree.nodes[AGE].connections = { true: PAGE, false: PAGE }),
    lines: [
      '  [NO_REACHABLE_TERMINAL] No terminal node is reachable from entry node "Login Page" (Page Node)',
    ],
  },
  {
    code: 'NODE_TYPE_MISMATCH',
    break: (journey) => (journey.tree.nodes[AGE].nodeType = 'DecisionNode'),
    lines: [
      "  [NODE_TYPE_MISMATCH] Tree node \"Check Age\" declares node type 'DecisionNode' but its definition has type 'ScriptedDecisionNode'",
    ],
  },
  {
    code: 'NODE_TYPE_MISMATCH',
    break: (journey) =>
      (journey.nodes[PAGE].nodes[0].nodeType = 'ValidatedPasswordNode'),
    lines: [
      '  [NODE_TYPE_MISMATCH] Page Node "Login Page" child "Username" declares node type \'ValidatedPasswordNode\' but its definition has type \'ValidatedUsernameNode\'',
    ],
  },
  {
    code: 'INNER_NODE_REFERENCED_BY_MULTIPLE_PAGES',
    break: (journey) => {
      addTreeNode(journey, PAGE_TWO, 'Second Page', 'PageNode', 'Page Node');
      journey.nodes[PAGE_TWO].nodes = [
        {
          _id: USER,
          displayName: 'Username',
          nodeType: 'ValidatedUsernameNode',
        },
      ];
    },
    lines: [
      `  [INNER_NODE_REFERENCED_BY_MULTIPLE_PAGES] Inner node "Username" (Platform Username) is referenced by multiple Page Nodes: ${PAGE}, ${PAGE_TWO}`,
    ],
  },
  {
    code: 'NODE_ID_COLLISION',
    break: (journey) =>
      (journey.innerNodes[AGE] = {
        _id: AGE,
        _type: { _id: 'ValidatedPasswordNode', name: 'Platform Password' },
      }),
    lines: [
      `  [NODE_ID_COLLISION] Node ID '${AGE}' exists in both nodes and innerNodes`,
    ],
  },
  {
    code: 'MISSING_SCRIPT_DEPENDENCY',
    break: (journey) => {
      journey.scripts = { other: {} };
      journey.nodes[AGE].script = 'gone';
    },
    lines: [
      '  [MISSING_SCRIPT_DEPENDENCY] Node "Check Age" (Scripted Decision) references script \'gone\' missing from the export',
    ],
  },
  {
    code: 'MISSING_EMAIL_TEMPLATE_DEPENDENCY',
    break: (journey) => {
      journey.emailTemplates = { other: {} };
      addTreeNode(
        journey,
        MAIL,
        'Send Welcome',
        'EmailTemplateNode',
        'Email Template'
      );
      journey.nodes[MAIL].emailTemplateName = 'gone';
    },
    lines: [
      '  [MISSING_EMAIL_TEMPLATE_DEPENDENCY] Node "Send Welcome" (Email Template) references emailTemplate \'gone\' missing from the export',
    ],
  },
  {
    code: 'MISSING_THEME_DEPENDENCY',
    break: (journey) => {
      journey.themes = [{ _id: 'other' }];
      journey.nodes[PAGE].stage = 'themeId=gone';
    },
    lines: [
      '  [MISSING_THEME_DEPENDENCY] Node "Login Page" (Page Node) references theme \'gone\' missing from the export',
    ],
  },
  {
    code: 'MISSING_SOCIAL_IDENTITY_PROVIDER_DEPENDENCY',
    break: (journey) => {
      journey.socialIdentityProviders = { other: {} };
      journey.innerNodes[IDP] = {
        _id: IDP,
        _type: { _id: 'SelectIdPNode', name: 'Select Identity Provider' },
        _outcomes: [{ id: 'outcome' }],
        filteredProviders: ['google'],
      };
      journey.nodes[PAGE].nodes.unshift({
        _id: IDP,
        displayName: 'Select IDP',
        nodeType: 'SelectIdPNode',
      });
    },
    lines: [
      '  [MISSING_SOCIAL_IDENTITY_PROVIDER_DEPENDENCY] Node "Select IDP" (Select Identity Provider) in Page Node "Login Page" references socialIdentityProvider \'google\' missing from the export',
    ],
  },
  {
    // two Page Nodes of one name, each with a node of one name: the ids tell them apart
    code: 'MISSING_SOCIAL_IDENTITY_PROVIDER_DEPENDENCY',
    break: (journey) => {
      journey.socialIdentityProviders = { other: {} };
      addTreeNode(journey, PAGE_TWO, 'Login Page', 'PageNode', 'Page Node');
      journey.nodes[PAGE_TWO].nodes = [];
      for (const [pageId, innerId] of [
        [PAGE, IDP],
        [PAGE_TWO, IDP_TWO],
      ]) {
        journey.innerNodes[innerId] = {
          _id: innerId,
          _type: { _id: 'SelectIdPNode', name: 'Select Identity Provider' },
          _outcomes: [{ id: 'outcome' }],
          filteredProviders: ['google'],
        };
        journey.nodes[pageId].nodes.unshift({
          _id: innerId,
          displayName: 'Select IDP',
          nodeType: 'SelectIdPNode',
        });
      }
    },
    lines: [
      '  [MISSING_SOCIAL_IDENTITY_PROVIDER_DEPENDENCY] Node "Select IDP" (Select Identity Provider, id e165f3c7) in Page Node "Login Page" (id ab9f607b) references socialIdentityProvider \'google\' missing from the export',
      '  [MISSING_SOCIAL_IDENTITY_PROVIDER_DEPENDENCY] Node "Select IDP" (Select Identity Provider, id e165f3c8) in Page Node "Login Page" (id ab9f607c) references socialIdentityProvider \'google\' missing from the export',
    ],
  },
  {
    code: 'MISSING_SAML_ENTITY_DEPENDENCY',
    break: (journey) => {
      journey.saml2Entities = { other: { entityId: 'other' } };
      addTreeNode(
        journey,
        SAML,
        'Federate',
        'product-Saml2Node',
        'SAML2 Authentication'
      );
      journey.nodes[SAML].metaAlias = '/alpha/sp';
      journey.nodes[SAML].idpEntityId = 'https://idp.example.com';
    },
    lines: [
      '  [MISSING_SAML_ENTITY_DEPENDENCY] Node "Federate" (SAML2 Authentication) references saml2Entity \'sp\' missing from the export',
      '  [MISSING_SAML_ENTITY_DEPENDENCY] Node "Federate" (SAML2 Authentication) references saml2Entity \'https://idp.example.com\' missing from the export',
    ],
  },
];

/** The ids that the library does not describe (nothing of the journey is called that) and so stay quoted. */
const UNRESOLVED = [NOWHERE];
/** The codes whose line is about the id itself. */
const ID_IS_THE_FINDING = ['NODE_ID_MISMATCH', 'NODE_ID_COLLISION'];
const QUOTED_UUID =
  /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g;

/** The export of the cases: a journey for each, named by its position. */
const keyOf = (index) => `case-${index}`;
const journeysExport = () => {
  const trees = {};
  CASES.forEach((testCase, index) => {
    const journey = loginJourney(keyOf(index));
    testCase.break(journey);
    trees[keyOf(index)] = journey;
  });
  return { trees };
};

let findings;

beforeAll(async () => {
  state.setRealm('/');
  findings = await frodo.authn.journey.validateJourneys(
    undefined,
    journeysExport()
  );
});

const findingsOf = (index, code) =>
  findings.filter(
    (finding) => finding.journeyId === keyOf(index) && finding.code === code
  );

describe('journey validate names the nodes of every finding code, with the real library', () => {
  test('the journey that the cases break is valid, so that every finding is the case', async () => {
    await expect(
      frodo.authn.journey.validateJourneys(['valid'], {
        trees: { valid: loginJourney('valid') },
      })
    ).resolves.toEqual([]);
    expect(
      findings.filter((finding) => !finding.journeyId.startsWith('case-'))
    ).toEqual([]);
  });

  test('a tree filed under another key has no node, and its line is the message of the library', async () => {
    const [mismatch] = await frodo.authn.journey.validateJourneys(undefined, {
      trees: { other: loginJourney('Login') },
    });

    expect(mismatch.code).toBe('TREE_ID_MISMATCH');
    expect(findingLine(mismatch)).toBe(
      `  [TREE_ID_MISMATCH] ${mismatch.message}`
    );
  });

  test.each(CASES.map((testCase, index) => [testCase.code, index, testCase]))(
    '%s (case %i) is written with the names of its nodes',
    (code, index, testCase) => {
      const ofCase = findingsOf(index, code);

      expect(ofCase.map((finding) => findingLine(finding))).toEqual(
        testCase.lines
      );
    }
  );

  test('no node of a finding is left as a quoted UUID, except the two codes about an id and the ids that nothing of the journey is called', () => {
    const lines = findings
      .filter((finding) => !ID_IS_THE_FINDING.includes(finding.code))
      .map((finding) => findingLine(finding));

    // all the codes that name a node have a case: a case that breaks nothing must not pass here
    expect(lines.length).toBeGreaterThanOrEqual(CASES.length);
    for (const line of lines) {
      const quoted = (line.match(QUOTED_UUID) ?? []).map((text) =>
        text.slice(1, -1)
      );
      expect(quoted.filter((uuid) => !UNRESOLVED.includes(uuid))).toEqual([]);
    }
  });

  test('the two codes about an id keep it, with the verbose option too', () => {
    for (const code of ID_IS_THE_FINDING) {
      const [finding] = findings.filter((candidate) => candidate.code === code);

      expect(finding.node).toBeDefined();
      expect(findingLine(finding)).toBe(`  [${code}] ${finding.message}`);
      expect(findingLine(finding, true)).toBe(`  [${code}] ${finding.message}`);
    }
  });

  test('with the verbose option every named node of every line has its full id', () => {
    const named = findings.filter(
      (finding) =>
        !ID_IS_THE_FINDING.includes(finding.code) &&
        (finding.node || finding.targetNode || finding.pageNode)
    );

    expect(named.length).toBeGreaterThan(0);
    for (const finding of named) {
      const line = findingLine(finding, true);
      for (const described of [
        finding.node,
        finding.targetNode,
        finding.pageNode,
      ]) {
        if (described) expect(line).toContain(`id ${described.id}`);
      }
      expect(line).not.toMatch(/ id [0-9a-f]{8}[,)]/);
    }
  });

  test('the library still quotes every id that it describes, so that a name can replace it', () => {
    for (const finding of findings) {
      for (const [idField, nodeField] of [
        ['nodeId', 'node'],
        ['targetNodeId', 'targetNode'],
        ['pageNodeId', 'pageNode'],
      ]) {
        if (finding[nodeField]) {
          expect(finding[nodeField].id).toBe(finding[idField]);
          expect(finding.message).toContain(`'${finding[idField]}'`);
        }
      }
    }
  });
});
