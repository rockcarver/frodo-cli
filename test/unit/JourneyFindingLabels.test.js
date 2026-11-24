import {
  countBySeverity,
  describeCounts,
  findingLine,
  hintsFor,
  journeyHeading,
  missingNodesHint,
  summaryLines,
  tallyByCode,
  unreachableNodesHint,
} from '../../src/ops/utils/JourneyFindingLabels.ts';

// The words of the output of `journey validate`: one line for a finding, one
// heading for a journey, one summary for the run, one hint for each finding
// code that has advice. Pure functions: they print nothing.

const finding = (
  code,
  severity,
  journeyId = 'login',
  message = `${code} text`
) => ({
  code,
  severity,
  journeyId,
  message,
});

describe('findingLine', () => {
  test('writes the code in brackets and then the message of the library, as it always did', () => {
    expect(
      findingLine(
        finding(
          'UNREACHABLE_NODE',
          'warning',
          'login',
          "Tree node 'n1' is not reachable"
        )
      )
    ).toBe("  [UNREACHABLE_NODE] Tree node 'n1' is not reachable");
  });

  test('writes a finding that the library describes no node of, and a code it has never heard of, as it always did', () => {
    // the finding of a library that has the ids but not the objects: the ids stay quoted as the library has them
    const entry = {
      ...finding(
        'MISSING_ENTRY_NODE',
        'error',
        'login',
        "Entry node 'd26176be-ea6f-4f2a-81cd-3d41dd6cee4d' does not resolve to a graph node"
      ),
      nodeId: 'd26176be-ea6f-4f2a-81cd-3d41dd6cee4d',
    };
    const unknown = {
      ...finding(
        'SOME_FUTURE_CODE',
        'warning',
        'login',
        "Something about node '295a70ba-1111-4222-8333-444455556666'"
      ),
      nodeId: '295a70ba-1111-4222-8333-444455556666',
    };

    expect(findingLine(entry)).toBe(`  [MISSING_ENTRY_NODE] ${entry.message}`);
    expect(findingLine(unknown)).toBe(
      `  [SOME_FUTURE_CODE] ${unknown.message}`
    );
    expect(findingLine(entry, true)).toBe(findingLine(entry));
    expect(findingLine(unknown, true)).toBe(findingLine(unknown));
  });
});

// A finding names a node as the Journey Editor shows it (cli#1378): the library describes each node of a finding
// (`node`, `targetNode`, `pageNode`) and the line replaces the quoted ids of its message by the words of the node.
// The words of each pattern of the library's messages, with the node ids of a real journey.
describe('findingLine names the nodes of a finding', () => {
  const LOCKOUT = 'a1b2c3d4-0000-4000-8000-000000000001';
  const AGE = '295a70ba-4b4b-4c4c-8d8d-000000000002';
  const PAGE = 'ab9f607b-1234-4abc-8def-000000000003';
  const IDP = 'e165f3c7-2222-4333-8444-000000000004';
  const USERNAME = '5d0d6a14-3333-4444-8555-000000000005';
  const PASSWORD = '44444444-aaaa-4bbb-8ccc-000000000006';

  const described = (code, severity, message, fields) => ({
    ...finding(code, severity, 'Login', message),
    ...fields,
  });
  const lockout = {
    id: LOCKOUT,
    displayName: 'Account Lockout',
    nodeType: 'AccountLockoutNode',
    nodeTypeName: 'Account Lockout',
  };
  const age = {
    id: AGE,
    displayName: 'Check Age',
    nodeType: 'ScriptedDecisionNode',
    nodeTypeName: 'Scripted Decision',
  };
  const page = {
    id: PAGE,
    displayName: 'Login Page',
    nodeType: 'PageNode',
    nodeTypeName: 'Page Node',
  };
  const idp = {
    id: IDP,
    displayName: 'Select IDP',
    nodeType: 'SelectIdPNode',
    nodeTypeName: 'Select Identity Provider',
  };
  const username = {
    id: USERNAME,
    displayName: 'Username',
    nodeType: 'ValidatedUsernameNode',
  };

  test('a node whose name is its type is written by the name alone', () => {
    expect(
      findingLine(
        described(
          'UNREACHABLE_NODE',
          'warning',
          `Tree node '${LOCKOUT}' is not reachable from the entry node`,
          { nodeId: LOCKOUT, node: lockout }
        )
      )
    ).toBe(
      '  [UNREACHABLE_NODE] Tree node "Account Lockout" is not reachable from the entry node'
    );
  });

  test('a node whose name is not its type gets the title of the type in brackets', () => {
    expect(
      findingLine(
        described(
          'UNREACHABLE_NODE',
          'warning',
          `Tree node '${AGE}' is not reachable from the entry node`,
          { nodeId: AGE, node: age }
        )
      )
    ).toBe(
      '  [UNREACHABLE_NODE] Tree node "Check Age" (Scripted Decision) is not reachable from the entry node'
    );
  });

  test('a node that the definition does not describe shows the id of its type, not a title made up from it', () => {
    expect(
      findingLine(
        described(
          'UNREACHABLE_NODE',
          'warning',
          `Tree node '${AGE}' is not reachable from the entry node`,
          {
            nodeId: AGE,
            node: {
              id: AGE,
              displayName: 'Check Age',
              nodeType: 'ScriptedDecisionNode',
            },
          }
        )
      )
    ).toBe(
      '  [UNREACHABLE_NODE] Tree node "Check Age" (ScriptedDecisionNode) is not reachable from the entry node'
    );
  });

  test('keeps the outcome that the library quotes, and names the node of an outcome', () => {
    expect(
      findingLine(
        described(
          'UNCONNECTED_OUTCOME',
          'warning',
          `Declared outcome 'false' on node '${AGE}' has no connection`,
          { nodeId: AGE, outcome: 'false', node: age }
        )
      )
    ).toBe(
      '  [UNCONNECTED_OUTCOME] Declared outcome \'false\' on node "Check Age" (Scripted Decision) has no connection'
    );
    expect(
      findingLine(
        described(
          'UNKNOWN_CONNECTION_OUTCOME',
          'warning',
          `Connection outcome 'maybe' is not declared by node '${AGE}'`,
          { nodeId: AGE, outcome: 'maybe', node: age }
        )
      )
    ).toBe(
      '  [UNKNOWN_CONNECTION_OUTCOME] Connection outcome \'maybe\' is not declared by node "Check Age" (Scripted Decision)'
    );
  });

  test('adds the first 8 characters of the id to a node that another node of the journey has the same name and type as', () => {
    expect(
      findingLine(
        described(
          'UNCONNECTED_OUTCOME',
          'warning',
          `Declared outcome 'outcome' on node '${USERNAME}' has no connection`,
          {
            nodeId: USERNAME,
            outcome: 'outcome',
            node: {
              id: USERNAME,
              displayName: 'Platform Username',
              nodeType: 'ValidatedUsernameNode',
              nodeTypeName: 'Platform Username',
              ambiguous: true,
            },
          }
        )
      )
    ).toBe(
      '  [UNCONNECTED_OUTCOME] Declared outcome \'outcome\' on node "Platform Username" (id 5d0d6a14) has no connection'
    );
    expect(
      findingLine(
        described(
          'UNREACHABLE_NODE',
          'warning',
          `Tree node '${AGE}' is not reachable from the entry node`,
          { nodeId: AGE, node: { ...age, ambiguous: true } }
        )
      )
    ).toBe(
      '  [UNREACHABLE_NODE] Tree node "Check Age" (Scripted Decision, id 295a70ba) is not reachable from the entry node'
    );
  });

  test('names the entry node of a journey with no terminal node, and keeps its type when the name is another', () => {
    expect(
      findingLine(
        described(
          'NO_REACHABLE_TERMINAL',
          'warning',
          `No terminal node is reachable from entry node '${USERNAME}'`,
          {
            nodeId: USERNAME,
            node: {
              id: USERNAME,
              displayName: 'name1',
              nodeType: 'ValidatedUsernameNode',
              nodeTypeName: 'Platform Username',
            },
          }
        )
      )
    ).toBe(
      '  [NO_REACHABLE_TERMINAL] No terminal node is reachable from entry node "name1" (Platform Username)'
    );
  });

  test('names a node of a Page Node and the Page Node, which the sentence already calls a Page Node', () => {
    expect(
      findingLine(
        described(
          'MISSING_SOCIAL_IDENTITY_PROVIDER_DEPENDENCY',
          'warning',
          `Node '${IDP}' in Page Node '${PAGE}' references socialIdentityProvider 'google' missing from the export`,
          {
            nodeId: IDP,
            pageNodeId: PAGE,
            dependencyType: 'socialIdentityProvider',
            dependencyId: 'google',
            node: { ...idp, ambiguous: true },
            pageNode: { ...page, ambiguous: true },
          }
        )
      )
    ).toBe(
      '  [MISSING_SOCIAL_IDENTITY_PROVIDER_DEPENDENCY] Node "Select IDP" (Select Identity Provider, id e165f3c7) in Page Node "Login Page" (id ab9f607b) references socialIdentityProvider \'google\' missing from the export'
    );
    expect(
      findingLine(
        described(
          'MISSING_SOCIAL_IDENTITY_PROVIDER_DEPENDENCY',
          'warning',
          `Node '${IDP}' in Page Node '${PAGE}' references socialIdentityProvider 'google' missing from the export`,
          { nodeId: IDP, pageNodeId: PAGE, node: idp, pageNode: page }
        )
      )
    ).toBe(
      '  [MISSING_SOCIAL_IDENTITY_PROVIDER_DEPENDENCY] Node "Select IDP" (Select Identity Provider) in Page Node "Login Page" references socialIdentityProvider \'google\' missing from the export'
    );
  });

  test('writes a Page Node that a sentence does not call a Page Node with its type', () => {
    expect(
      findingLine(
        described(
          'MISSING_THEME_DEPENDENCY',
          'warning',
          `Node '${PAGE}' references theme 'gone' missing from the export`,
          { nodeId: PAGE, node: page }
        )
      )
    ).toBe(
      '  [MISSING_THEME_DEPENDENCY] Node "Login Page" (Page Node) references theme \'gone\' missing from the export'
    );
  });

  test('names the Page Node and the inner node that it holds and that is not there, whose type the sentence says', () => {
    expect(
      findingLine(
        described(
          'MISSING_INNER_NODE',
          'error',
          `Page Node '${PAGE}' references missing inner node '${USERNAME}' (ValidatedUsernameNode)`,
          {
            nodeId: PAGE,
            targetNodeId: USERNAME,
            node: { ...page, ambiguous: true },
            targetNode: username,
          }
        )
      )
    ).toBe(
      '  [MISSING_INNER_NODE] Page Node "Login Page" (id ab9f607b) references missing inner node "Username" (ValidatedUsernameNode)'
    );
  });

  test('names a tree node that has no definition, without saying its type twice', () => {
    const noDefinition = {
      id: AGE,
      displayName: 'Check Username',
      nodeType: 'ScriptedDecisionNode',
    };
    expect(
      findingLine(
        described(
          'MISSING_NODE_DEFINITION',
          'error',
          `Tree node '${AGE}' has no node definition (ScriptedDecisionNode)`,
          { nodeId: AGE, node: noDefinition }
        )
      )
    ).toBe(
      '  [MISSING_NODE_DEFINITION] Tree node "Check Username" has no node definition (ScriptedDecisionNode)'
    );
    expect(
      findingLine(
        described(
          'MISSING_NODE_DEFINITION',
          'error',
          `Tree node '${AGE}' has no node definition (ScriptedDecisionNode)`,
          { nodeId: AGE, node: { ...noDefinition, ambiguous: true } }
        )
      )
    ).toBe(
      '  [MISSING_NODE_DEFINITION] Tree node "Check Username" (id 295a70ba) has no node definition (ScriptedDecisionNode)'
    );
  });

  test('writes a node without a name by its type and the first 8 characters of its id, as it is not on the canvas', () => {
    expect(
      findingLine(
        described(
          'UNREFERENCED_INNER_NODE',
          'warning',
          `Inner node '${PASSWORD}' is not referenced by a Page Node`,
          {
            nodeId: PASSWORD,
            node: {
              id: PASSWORD,
              nodeType: 'ValidatedPasswordNode',
              nodeTypeName: 'Platform Password',
            },
          }
        )
      )
    ).toBe(
      '  [UNREFERENCED_INNER_NODE] Inner node (Platform Password, id 44444444) is not referenced by a Page Node'
    );
    expect(
      findingLine(
        described(
          'UNREFERENCED_INNER_NODE',
          'warning',
          `Inner node '${PASSWORD}' is not referenced by a Page Node`,
          { nodeId: PASSWORD, node: { id: PASSWORD } }
        )
      )
    ).toBe(
      '  [UNREFERENCED_INNER_NODE] Inner node (id 44444444) is not referenced by a Page Node'
    );
  });

  test('names the node of a connection that leads nowhere and keeps the id of the target that is not there', () => {
    expect(
      findingLine(
        described(
          'MISSING_CONNECTION_TARGET',
          'error',
          `Connection from node '${AGE}' targets missing graph node 'f00dfeed-0000-4000-8000-000000000009'`,
          {
            nodeId: AGE,
            targetNodeId: 'f00dfeed-0000-4000-8000-000000000009',
            node: age,
          }
        )
      )
    ).toBe(
      '  [MISSING_CONNECTION_TARGET] Connection from node "Check Age" (Scripted Decision) targets missing graph node \'f00dfeed-0000-4000-8000-000000000009\''
    );
  });

  test('names the Page Node and the child of a type mismatch without a second type, as the sentence has both', () => {
    expect(
      findingLine(
        described(
          'NODE_TYPE_MISMATCH',
          'warning',
          `Tree node '${AGE}' declares node type 'DecisionNode' but its definition has type 'ScriptedDecisionNode'`,
          { nodeId: AGE, node: { ...age, nodeType: 'DecisionNode' } }
        )
      )
    ).toBe(
      "  [NODE_TYPE_MISMATCH] Tree node \"Check Age\" declares node type 'DecisionNode' but its definition has type 'ScriptedDecisionNode'"
    );
    expect(
      findingLine(
        described(
          'NODE_TYPE_MISMATCH',
          'warning',
          `Page Node '${PAGE}' child '${USERNAME}' declares node type 'ValidatedPasswordNode' but its definition has type 'ValidatedUsernameNode'`,
          {
            nodeId: PAGE,
            targetNodeId: USERNAME,
            node: page,
            targetNode: {
              ...username,
              nodeType: 'ValidatedPasswordNode',
              nodeTypeName: 'Platform Username',
            },
          }
        )
      )
    ).toBe(
      '  [NODE_TYPE_MISMATCH] Page Node "Login Page" child "Username" declares node type \'ValidatedPasswordNode\' but its definition has type \'ValidatedUsernameNode\''
    );
  });

  test('names the Page Node of an outcome that does not match', () => {
    expect(
      findingLine(
        described(
          'PAGE_NODE_OUTCOME_MISMATCH',
          'warning',
          `Page Node '${PAGE}' is missing exposed outcome 'outcome'`,
          { nodeId: PAGE, outcome: 'outcome', node: page }
        )
      )
    ).toBe(
      '  [PAGE_NODE_OUTCOME_MISMATCH] Page Node "Login Page" is missing exposed outcome \'outcome\''
    );
  });

  test('names the inner node of two Page Nodes and leaves the list of the Page Nodes as the library has it', () => {
    expect(
      findingLine(
        described(
          'INNER_NODE_REFERENCED_BY_MULTIPLE_PAGES',
          'warning',
          `Inner node '${USERNAME}' is referenced by multiple Page Nodes: ${PAGE}, ${IDP}`,
          {
            nodeId: USERNAME,
            node: { ...username, nodeTypeName: 'Platform Username' },
          }
        )
      )
    ).toBe(
      `  [INNER_NODE_REFERENCED_BY_MULTIPLE_PAGES] Inner node "Username" (Platform Username) is referenced by multiple Page Nodes: ${PAGE}, ${IDP}`
    );
  });

  test.each([
    [
      'NODE_ID_MISMATCH',
      `Node definition key '${AGE}' does not match _id 'renamed'`,
    ],
    [
      'NODE_ID_COLLISION',
      `Node ID '${AGE}' exists in both nodes and innerNodes`,
    ],
  ])(
    '%s keeps the id that it is about, whatever the library says of the node',
    (code, message) => {
      const line = findingLine(
        described(code, 'warning', message, { nodeId: AGE, node: age }),
        true
      );

      expect(line).toBe(`  [${code}] ${message}`);
    }
  );

  test('replaces an id wherever the library quotes it, and never an id that it does not describe', () => {
    expect(
      findingLine(
        described(
          'SOME_FUTURE_CODE',
          'warning',
          `Node '${AGE}' and node '${AGE}' and node '${LOCKOUT}'`,
          { nodeId: AGE, node: age }
        )
      )
    ).toBe(
      `  [SOME_FUTURE_CODE] Node "Check Age" (Scripted Decision) and node "Check Age" (Scripted Decision) and node '${LOCKOUT}'`
    );
  });

  test('matches an id as text, so that an id with the characters of a pattern does not match another id', () => {
    const odd = { id: 'a.c', displayName: 'Dotted', nodeType: 'Dotted' };

    expect(
      findingLine(
        described(
          'UNREACHABLE_NODE',
          'warning',
          "Tree node 'a.c' is not reachable, and neither is 'abc'",
          { nodeId: 'a.c', node: odd }
        )
      )
    ).toBe(
      '  [UNREACHABLE_NODE] Tree node "Dotted" is not reachable, and neither is \'abc\''
    );
  });

  test.each([
    'q(r',
    'x)',
    'a|b',
    'a\\',
    '[y',
    'z]',
    '*',
    '+',
    '?',
    '{1}',
    '^',
    '$',
    '(x|y)',
  ])('names a node whose id holds the characters of a pattern, %s', (odd) => {
    expect(
      findingLine(
        described(
          'UNREACHABLE_NODE',
          'warning',
          `Tree node '${odd}' is not reachable, and neither is 'a'`,
          {
            nodeId: odd,
            node: { id: odd, displayName: 'Odd', nodeType: 'OddNode' },
          }
        )
      )
    ).toBe(
      '  [UNREACHABLE_NODE] Tree node "Odd" (OddNode) is not reachable, and neither is \'a\''
    );
  });

  test('puts the type before the id of a node only when the text right before the id is the title of its type', () => {
    // the words Page Node are in the sentence, but not right before the inner node: its type is not said there
    expect(
      findingLine(
        described(
          'MISSING_INNER_NODE',
          'error',
          "Page Node 'p' references missing inner node 'c'",
          {
            nodeId: 'p',
            targetNodeId: 'c',
            node: {
              id: 'p',
              displayName: 'Login Page',
              nodeType: 'PageNode',
              nodeTypeName: 'Page Node',
            },
            targetNode: {
              id: 'c',
              displayName: 'Child',
              nodeType: 'PageNode',
              nodeTypeName: 'Page Node',
            },
          }
        )
      )
    ).toBe(
      '  [MISSING_INNER_NODE] Page Node "Login Page" references missing inner node "Child" (Page Node)'
    );
  });

  test('leaves the quoted id when the message of the library does not quote it', () => {
    const line = findingLine(
      described(
        'UNREACHABLE_NODE',
        'warning',
        `Tree node ${AGE} is not reachable`,
        { nodeId: AGE, node: age }
      )
    );

    expect(line).toBe(`  [UNREACHABLE_NODE] Tree node ${AGE} is not reachable`);
  });

  describe('with the verbose option', () => {
    test('adds the full id to every named node, a node that is not a tie as well', () => {
      expect(
        findingLine(
          described(
            'UNREACHABLE_NODE',
            'warning',
            `Tree node '${AGE}' is not reachable from the entry node`,
            { nodeId: AGE, node: age }
          ),
          true
        )
      ).toBe(
        `  [UNREACHABLE_NODE] Tree node "Check Age" (Scripted Decision, id ${AGE}) is not reachable from the entry node`
      );
      expect(
        findingLine(
          described(
            'UNREACHABLE_NODE',
            'warning',
            `Tree node '${LOCKOUT}' is not reachable from the entry node`,
            { nodeId: LOCKOUT, node: lockout }
          ),
          true
        )
      ).toBe(
        `  [UNREACHABLE_NODE] Tree node "Account Lockout" (id ${LOCKOUT}) is not reachable from the entry node`
      );
    });

    test('writes the full id of a tie and of a node without a name, never 8 characters', () => {
      expect(
        findingLine(
          described(
            'UNREACHABLE_NODE',
            'warning',
            `Tree node '${AGE}' is not reachable from the entry node`,
            { nodeId: AGE, node: { ...age, ambiguous: true } }
          ),
          true
        )
      ).toBe(
        `  [UNREACHABLE_NODE] Tree node "Check Age" (Scripted Decision, id ${AGE}) is not reachable from the entry node`
      );
      expect(
        findingLine(
          described(
            'UNREFERENCED_INNER_NODE',
            'warning',
            `Inner node '${PASSWORD}' is not referenced by a Page Node`,
            { nodeId: PASSWORD, node: { id: PASSWORD } }
          ),
          true
        )
      ).toBe(
        `  [UNREFERENCED_INNER_NODE] Inner node (id ${PASSWORD}) is not referenced by a Page Node`
      );
    });

    test('names every node of the sentence with its full id, in one group with the type that the library says', () => {
      expect(
        findingLine(
          described(
            'MISSING_INNER_NODE',
            'error',
            `Page Node '${PAGE}' references missing inner node '${USERNAME}' (ValidatedUsernameNode)`,
            {
              nodeId: PAGE,
              targetNodeId: USERNAME,
              node: page,
              targetNode: username,
            }
          ),
          true
        )
      ).toBe(
        `  [MISSING_INNER_NODE] Page Node "Login Page" (id ${PAGE}) references missing inner node "Username" (ValidatedUsernameNode, id ${USERNAME})`
      );
    });
  });

  describe('where the library says the type of a node in brackets after its id', () => {
    const missingInner = (targetNode) =>
      described(
        'MISSING_INNER_NODE',
        'error',
        `Page Node '${PAGE}' references missing inner node '${USERNAME}' (ValidatedUsernameNode)`,
        {
          nodeId: PAGE,
          targetNodeId: USERNAME,
          node: page,
          targetNode,
        }
      );

    test('the id of a tie goes into those brackets, so that the line has one group', () => {
      expect(findingLine(missingInner({ ...username, ambiguous: true }))).toBe(
        '  [MISSING_INNER_NODE] Page Node "Login Page" references missing inner node "Username" (ValidatedUsernameNode, id 5d0d6a14)'
      );
    });

    test('so does the id of a node without a name', () => {
      expect(
        findingLine(
          missingInner({ id: USERNAME, nodeType: 'ValidatedUsernameNode' })
        )
      ).toBe(
        '  [MISSING_INNER_NODE] Page Node "Login Page" references missing inner node (ValidatedUsernameNode, id 5d0d6a14)'
      );
    });

    test('a node that needs no id leaves the brackets as the library has them', () => {
      expect(findingLine(missingInner(username))).toBe(
        '  [MISSING_INNER_NODE] Page Node "Login Page" references missing inner node "Username" (ValidatedUsernameNode)'
      );
    });

    test('brackets that are not the type of the node stay as they are, after the words of the node', () => {
      expect(
        findingLine(
          described(
            'SOME_FUTURE_CODE',
            'warning',
            `Tree node '${AGE}' (retired) is not reachable`,
            { nodeId: AGE, node: { ...age, ambiguous: true } }
          )
        )
      ).toBe(
        '  [SOME_FUTURE_CODE] Tree node "Check Age" (Scripted Decision, id 295a70ba) (retired) is not reachable'
      );
    });

    test('brackets with a quoted id in them are not taken with the id before them, so that the id inside is named too', () => {
      expect(
        findingLine(
          described(
            'SOME_FUTURE_CODE',
            'warning',
            `Tree node '${AGE}' (see '${LOCKOUT}') is not reachable`,
            {
              nodeId: AGE,
              targetNodeId: LOCKOUT,
              node: age,
              targetNode: lockout,
            }
          )
        )
      ).toBe(
        '  [SOME_FUTURE_CODE] Tree node "Check Age" (Scripted Decision) (see "Account Lockout") is not reachable'
      );
    });
  });

  describe('a name that a tenant gave a node', () => {
    test('is written so that a control character cannot change what the terminal shows', () => {
      const line = findingLine(
        described(
          'UNREACHABLE_NODE',
          'warning',
          `Tree node '${AGE}' is not reachable from the entry node`,
          {
            nodeId: AGE,
            node: {
              ...age,
              displayName: 'Check\u001b[2J Age',
              nodeTypeName: 'Scripted\nDecision',
            },
          }
        )
      );

      expect(line).toBe(
        '  [UNREACHABLE_NODE] Tree node "Check\\u001b[2J Age" (Scripted\\u000aDecision) is not reachable from the entry node'
      );
      expect(line).not.toContain('\u001b');
      expect(line).not.toContain('\n');
    });

    test('is not cut, not changed by quotes and not read as a pattern of the replacement', () => {
      const name =
        'A "quoted" name with $& and $1 and a very long tail that goes on and on to be sure that nothing cuts it short';

      expect(
        findingLine(
          described(
            'UNREACHABLE_NODE',
            'warning',
            `Tree node '${AGE}' is not reachable from the entry node`,
            { nodeId: AGE, node: { ...age, displayName: name } }
          )
        )
      ).toBe(
        `  [UNREACHABLE_NODE] Tree node "${name}" (Scripted Decision) is not reachable from the entry node`
      );
    });

    test('is escaped in the id that a tenant chose for a node, too', () => {
      expect(
        findingLine(
          described(
            'UNREFERENCED_INNER_NODE',
            'warning',
            "Inner node 'x\u001by' is not referenced by a Page Node",
            { nodeId: 'x\u001by', node: { id: 'x\u001by' } }
          )
        )
      ).toBe(
        '  [UNREFERENCED_INNER_NODE] Inner node (id x\\u001by) is not referenced by a Page Node'
      );
    });
  });
});

describe('countBySeverity and describeCounts', () => {
  test('count errors and warnings by their severity', () => {
    expect(
      countBySeverity([
        finding('MISSING_ENTRY_NODE', 'error'),
        finding('UNREACHABLE_NODE', 'warning'),
        finding('UNCONNECTED_OUTCOME', 'warning'),
      ])
    ).toEqual({ errors: 1, warnings: 2 });
  });

  test('a finding of another severity is neither an error nor a warning', () => {
    expect(
      countBySeverity([
        finding('UNREACHABLE_NODE', 'warning'),
        finding('SOMETHING', 'info'),
      ])
    ).toEqual({ errors: 0, warnings: 1 });
  });

  test.each([
    [{ errors: 1, warnings: 0 }, '1 error'],
    [{ errors: 2, warnings: 0 }, '2 errors'],
    [{ errors: 0, warnings: 1 }, '1 warning'],
    [{ errors: 0, warnings: 3 }, '3 warnings'],
    [{ errors: 1, warnings: 1 }, '1 error and 1 warning'],
    [{ errors: 2, warnings: 5 }, '2 errors and 5 warnings'],
    [{ errors: 0, warnings: 0 }, ''],
  ])('%j is written as "%s"', (counts, text) => {
    expect(describeCounts(counts)).toBe(text);
  });
});

describe('journeyHeading', () => {
  test('names the counts and the journey', () => {
    expect(journeyHeading('login', { errors: 1, warnings: 1 }, false)).toBe(
      '1 error and 1 warning in journey login'
    );
  });

  test('says in strict mode that warnings alone fail the journey', () => {
    expect(journeyHeading('login', { errors: 0, warnings: 1 }, true)).toBe(
      '1 warning in journey login (strict mode treats warnings as errors)'
    );
  });

  test('says nothing of strict mode when the journey has an error anyway, or when it is not strict', () => {
    expect(journeyHeading('login', { errors: 1, warnings: 1 }, true)).toBe(
      '1 error and 1 warning in journey login'
    );
    expect(journeyHeading('login', { errors: 0, warnings: 2 }, false)).toBe(
      '2 warnings in journey login'
    );
  });
});

describe('tallyByCode', () => {
  test('counts the findings of each code, the most frequent first and then by code', () => {
    const tally = tallyByCode([
      finding('UNREACHABLE_NODE', 'warning', 'a'),
      finding('UNREACHABLE_NODE', 'warning', 'b'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'a'),
      finding('UNREACHABLE_NODE', 'warning', 'c'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'c'),
      finding('NO_REACHABLE_TERMINAL', 'warning', 'c'),
    ]);

    expect(tally.map(({ code, count }) => [code, count])).toEqual([
      ['UNREACHABLE_NODE', 3],
      ['UNCONNECTED_OUTCOME', 2],
      ['NO_REACHABLE_TERMINAL', 1],
    ]);
  });

  test('puts codes with the same error status and the same count in the order of the code, whatever the order of the findings', () => {
    const inOrder = [
      finding('NO_REACHABLE_TERMINAL', 'warning', 'a'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'a'),
      finding('UNREACHABLE_NODE', 'warning', 'a'),
      finding('MISSING_INNER_NODE', 'error', 'a'),
      finding('MISSING_CONNECTION_TARGET', 'error', 'a'),
    ];
    const expected = [
      'MISSING_CONNECTION_TARGET',
      'MISSING_INNER_NODE',
      'NO_REACHABLE_TERMINAL',
      'UNCONNECTED_OUTCOME',
      'UNREACHABLE_NODE',
    ];

    expect(tallyByCode(inOrder).map(({ code }) => code)).toEqual(expected);
    expect(tallyByCode([...inOrder].reverse()).map(({ code }) => code)).toEqual(
      expected
    );
  });

  test('puts the codes that have errors first, however few errors there are, then the rest by count', () => {
    const tally = tallyByCode([
      finding('UNREACHABLE_NODE', 'warning', 'a'),
      finding('UNREACHABLE_NODE', 'warning', 'b'),
      finding('UNREACHABLE_NODE', 'warning', 'c'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'a'),
      finding('UNCONNECTED_OUTCOME', 'warning', 'b'),
      finding('MISSING_ENTRY_NODE', 'error', 'c'),
      finding('MISSING_INNER_NODE', 'error', 'a'),
      finding('MISSING_INNER_NODE', 'error', 'b'),
      finding('NO_REACHABLE_TERMINAL', 'warning', 'c'),
    ]);

    expect(tally.map(({ code }) => code)).toEqual([
      'MISSING_INNER_NODE',
      'MISSING_ENTRY_NODE',
      'UNREACHABLE_NODE',
      'UNCONNECTED_OUTCOME',
      'NO_REACHABLE_TERMINAL',
    ]);
  });

  test('keeps the severities of one code apart', () => {
    const [entry] = tallyByCode([
      finding('SOME_CODE', 'error'),
      finding('SOME_CODE', 'warning'),
      finding('SOME_CODE', 'warning'),
    ]);

    expect(entry).toMatchObject({
      code: 'SOME_CODE',
      count: 3,
      errors: 1,
      warnings: 2,
    });
  });
});

describe('summaryLines', () => {
  const findings = [
    finding('UNREACHABLE_NODE', 'warning', 'a'),
    finding('UNREACHABLE_NODE', 'warning', 'b'),
    finding('MISSING_INNER_NODE', 'error', 'b'),
  ];

  test('says how many journeys were checked, how many have findings and how many findings of each code there are, the code with an error first', () => {
    expect(summaryLines({ checked: 5, total: 5, findings })).toEqual([
      'Checked 5 journeys, 2 with findings: 1 error and 2 warnings.',
      '  MISSING_INNER_NODE: 1 error',
      '  UNREACHABLE_NODE: 2 warnings',
    ]);
  });

  test('says how many of the journeys could be checked when some could not', () => {
    expect(summaryLines({ checked: 20, total: 21, findings })[0]).toBe(
      'Checked 20 of 21 journeys, 2 with findings: 1 error and 2 warnings.'
    );
    expect(summaryLines({ checked: 1, total: 2, findings })[0]).toBe(
      'Checked 1 of 2 journeys, 2 with findings: 1 error and 2 warnings.'
    );
  });

  test('counts a journey once however many findings it has', () => {
    const [first] = summaryLines({
      checked: 3,
      total: 3,
      findings: [
        finding('UNREACHABLE_NODE', 'warning', 'a'),
        finding('UNCONNECTED_OUTCOME', 'warning', 'a'),
        finding('UNREACHABLE_NODE', 'warning', 'a'),
      ],
    });

    expect(first).toBe('Checked 3 journeys, 1 with findings: 3 warnings.');
  });

  test('says one journey in the singular', () => {
    expect(
      summaryLines({
        checked: 1,
        total: 1,
        findings: [finding('UNREACHABLE_NODE', 'warning')],
      })[0]
    ).toBe('Checked 1 journey, 1 with findings: 1 warning.');
  });

  test('has one line for each code and the codes the findings have', () => {
    expect(summaryLines({ checked: 5, total: 5, findings })).toHaveLength(3);
    expect(summaryLines({ checked: 5, total: 5, findings: [] })).toEqual([]);
  });
});

describe('hintsFor', () => {
  const missingEntry = (journeyId) =>
    finding('MISSING_ENTRY_NODE', 'error', journeyId);
  const unreachable = (journeyId) =>
    finding('UNREACHABLE_NODE', 'warning', journeyId);
  const missingInner = (journeyId) =>
    finding('MISSING_INNER_NODE', 'error', journeyId);

  test('gives no hint for findings that need none', () => {
    expect(
      hintsFor(
        [missingEntry('a'), finding('UNCONNECTED_OUTCOME', 'warning', 'a')],
        true
      )
    ).toEqual([]);
    expect(hintsFor([], true)).toEqual([]);
  });

  test('gives the hint for nodes that are not there once, whichever of the two codes (or both) are found', () => {
    expect(hintsFor([missingInner('a')], true)).toEqual([
      missingNodesHint(true),
    ]);
    expect(
      hintsFor([finding('MISSING_NODE_DEFINITION', 'error', 'a')], true)
    ).toEqual([missingNodesHint(true)]);
    expect(
      hintsFor(
        [
          finding('MISSING_NODE_DEFINITION', 'error', 'a'),
          missingInner('a'),
          missingInner('b'),
        ],
        false
      )
    ).toEqual([missingNodesHint(false)]);
  });

  test('gives the hint for unreachable nodes once, in the words of where the journeys are', () => {
    expect(hintsFor([unreachable('a'), unreachable('b')], true)).toEqual([
      'Journeys with UNREACHABLE_NODE have nodes that cannot be reached from the entry node. Connect them or delete them in the journey editor.',
    ]);
    expect(hintsFor([unreachable('a'), unreachable('b')], false)).toEqual([
      'Journeys with UNREACHABLE_NODE have nodes that cannot be reached from the entry node. Connect them or delete them on the tenant and export the journeys again.',
    ]);
  });

  test('names the code that it is about, so that it still says what it points at after a run over a realm', () => {
    expect(unreachableNodesHint(true, false)).toContain('UNREACHABLE_NODE');
    expect(unreachableNodesHint(false, false)).toContain('UNREACHABLE_NODE');
  });

  test('says to repair the entry node first when a journey that has unreachable nodes has no entry node', () => {
    const repairFirst =
      ' In a journey that also has MISSING_ENTRY_NODE, repair the entry node first: until then every node of it is unreachable.';

    expect(hintsFor([unreachable('a'), missingEntry('a')], true)).toEqual([
      'Journeys with UNREACHABLE_NODE have nodes that cannot be reached from the entry node. Connect them or delete them in the journey editor.' +
        repairFirst,
    ]);
    expect(hintsFor([unreachable('a'), missingEntry('a')], false)).toEqual([
      'Journeys with UNREACHABLE_NODE have nodes that cannot be reached from the entry node. Connect them or delete them on the tenant and export the journeys again.' +
        repairFirst,
    ]);
  });

  test('says nothing of the entry node when the journey without one is another journey than the one with unreachable nodes', () => {
    expect(hintsFor([unreachable('a'), missingEntry('b')], true)).toEqual([
      unreachableNodesHint(true, false),
    ]);
    expect(unreachableNodesHint(true, false)).not.toContain(
      'MISSING_ENTRY_NODE'
    );
  });

  test('gives the hints in a fixed order, whatever the order of the findings', () => {
    const findings = [unreachable('a'), missingInner('b')];

    expect(hintsFor(findings, true)).toEqual(
      hintsFor([...findings].reverse(), true)
    );
    expect(hintsFor(findings, true)).toEqual([
      missingNodesHint(true),
      unreachableNodesHint(true, false),
    ]);
  });

  test('every hint is one line', () => {
    for (const hint of [
      missingNodesHint(true),
      missingNodesHint(false),
      unreachableNodesHint(true, false),
      unreachableNodesHint(false, true),
    ]) {
      expect(hint).not.toContain('\n');
    }
  });
});
