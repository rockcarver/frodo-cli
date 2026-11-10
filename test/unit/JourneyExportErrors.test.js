import { describe, expect, test } from '@jest/globals';
import {
  missingNodesMessage,
  missingNodesName,
  missingNodesOf,
  missingNodesReason,
} from '../../src/utils/JourneyExportErrors.ts';
import {
  FrodoError,
  httpError,
  innerNodeError,
  journeyError,
  passwordBreachDetectionError,
  readNodeError,
} from '../utils/LibErrorShapes.js';

/**
 * src/utils/JourneyExportErrors.ts: when every part of a journey that could not
 * be exported is a node that the tenant answered with 404, the error is one
 * line; anything else is not summarised, so that nothing is hidden.
 */

const ID = '53bbcda5-0f75-4f95-bafe-6208020e9d8f';
const OTHER = '84a508f5-7f31-44ec-981f-a64dcfe8ffdd';

describe('the test double of the library error', () => {
  test('prints like the error of a journey did on a real tenant', () => {
    const urls = (type, id) =>
      `    URL: https://matrix.example.com/am/json/realms/root/realms/alpha/realm-config/authentication/authenticationtrees/nodes/${type}/1.0/${id}`;
    const block = (type, id) =>
      [
        `    Error reading ${type} node ${id}`,
        '  Network error:',
        urls(type, id),
        '    Status: 404',
        '    Code: ERR_BAD_REQUEST',
        '    Reason: Not Found',
        '    Message: Not Found',
      ].join('\n');
    expect(passwordBreachDetectionError().toString()).toBe(
      [
        'Error exporting the alpha realm journey PasswordBreachDetection',
        '  Error exporting alpha realm journey PasswordBreachDetection',
        block('ValidatedPasswordNode', ID),
        block('MessageNode', OTHER),
        block('MessageNode', 'e90307e7-8e1a-4b08-bc23-8810f9308758'),
        block('MessageNode', 'd0b058da-3d5a-41e0-92d5-5dfc3892ee6c'),
      ].join('\n')
    );
  });
});

describe('a journey whose nodes were not found', () => {
  test('four nodes of a page: the journey and the nodes by type and id', () => {
    const missing = missingNodesOf(passwordBreachDetectionError());

    expect(missing).toEqual({
      realm: 'alpha',
      journeyId: 'PasswordBreachDetection',
      nodes: [
        { type: 'ValidatedPasswordNode', id: ID },
        { type: 'MessageNode', id: OTHER },
        { type: 'MessageNode', id: 'e90307e7-8e1a-4b08-bc23-8810f9308758' },
        { type: 'MessageNode', id: 'd0b058da-3d5a-41e0-92d5-5dfc3892ee6c' },
      ],
    });
    expect(missingNodesReason(missing)).toBe(
      '4 of its nodes were not found on the tenant (HTTP 404)'
    );
    expect(missingNodesMessage(missing)).toBe(
      'Journey PasswordBreachDetection of the alpha realm could not be exported: 4 of its nodes were not found on the tenant (HTTP 404): ' +
        `ValidatedPasswordNode ${ID}, MessageNode ${OTHER}, MessageNode e90307e7-8e1a-4b08-bc23-8810f9308758, MessageNode d0b058da-3d5a-41e0-92d5-5dfc3892ee6c`
    );
  });

  test('one node: the reason is in the singular', () => {
    const missing = missingNodesOf(
      journeyError('Login', [innerNodeError('MessageNode', OTHER)])
    );

    expect(missingNodesReason(missing)).toBe(
      '1 of its nodes was not found on the tenant (HTTP 404)'
    );
    expect(missingNodesMessage(missing)).toBe(
      `Journey Login of the alpha realm could not be exported: 1 of its nodes was not found on the tenant (HTTP 404): MessageNode ${OTHER}`
    );
  });

  test('a node that was read directly (a structured error with the http cause) counts too', () => {
    const missing = missingNodesOf(
      journeyError('Login', [
        readNodeError('ValidatedPasswordNode', ID),
        innerNodeError('MessageNode', OTHER),
      ])
    );

    expect(missing.nodes).toEqual([
      { type: 'ValidatedPasswordNode', id: ID },
      { type: 'MessageNode', id: OTHER },
    ]);
  });

  test('a journey name with spaces and a realm in another name', () => {
    const missing = missingNodesOf(
      journeyError(
        'Protect - Verified OnBoarding',
        [innerNodeError('MessageNode', OTHER)],
        'bravo'
      )
    );

    expect(missing.journeyId).toBe('Protect - Verified OnBoarding');
    expect(missing.realm).toBe('bravo');
    expect(missingNodesName(missing)).toBe(
      'bravo/Protect - Verified OnBoarding'
    );
  });

  test('the server saying "not found" in other letters is still a plain not found', () => {
    const missing = missingNodesOf(
      journeyError('Login', [
        readNodeError('MessageNode', OTHER, 404, { message: 'NOT FOUND' }),
      ])
    );

    expect(missing).toBeDefined();
  });
});

describe('an error that says anything else is not summarised', () => {
  test('a 404 and a 500 in one journey', () => {
    expect(
      missingNodesOf(
        journeyError('Login', [
          innerNodeError('MessageNode', OTHER),
          innerNodeError('MessageNode', ID, 500, {
            code: 500,
            reason: 'Internal Server Error',
            message: 'boom',
          }),
        ])
      )
    ).toBeUndefined();
  });

  test('a 500 in the structured shape', () => {
    expect(
      missingNodesOf(
        journeyError('Login', [readNodeError('MessageNode', OTHER, 500)])
      )
    ).toBeUndefined();
  });

  test.each([
    ['a 403', 403],
    ['a 401', 401],
  ])('%s', (name, status) => {
    expect(
      missingNodesOf(
        journeyError('Login', [innerNodeError('MessageNode', OTHER, status)])
      )
    ).toBeUndefined();
  });

  test('a 404 whose answer says more than "Not Found" (text of the server)', () => {
    for (const make of [innerNodeError, readNodeError]) {
      expect(
        missingNodesOf(
          journeyError('Login', [
            make('MessageNode', OTHER, 404, {
              code: 404,
              reason: 'Not Found',
              message: 'No such node type in this version',
            }),
          ])
        )
      ).toBeUndefined();
      expect(
        missingNodesOf(
          journeyError('Login', [
            make('MessageNode', OTHER, 404, {
              reason: 'Not Found',
              message: 'Not Found',
              detail: { reason: 'x' },
            }),
          ])
        )
      ).toBeUndefined();
    }
  });

  test('a part of the journey that is not a node, next to missing nodes', () => {
    expect(
      missingNodesOf(
        journeyError('Login', [
          innerNodeError('MessageNode', OTHER),
          new FrodoError(
            'Error reading email templates',
            httpError('https://matrix.example.com/openidm/config', 404)
          ),
        ])
      )
    ).toBeUndefined();
  });

  test('an error that carries no cause, only a title', () => {
    expect(
      missingNodesOf(
        journeyError('Login', [
          new FrodoError('Error reading MessageNode node x'),
        ])
      )
    ).toBeUndefined();
  });

  test('a node error with a cause that is not an http answer', () => {
    expect(
      missingNodesOf(
        journeyError('Login', [
          new FrodoError('Error reading MessageNode node x', new Error('boom')),
        ])
      )
    ).toBeUndefined();
  });

  test('an error with several causes', () => {
    const cause = httpError('https://matrix.example.com/x', 404);
    expect(
      missingNodesOf(
        journeyError('Login', [
          new FrodoError('Error reading MessageNode node x', [cause, cause]),
        ])
      )
    ).toBeUndefined();
  });

  test('not the error of a journey of an export', () => {
    expect(missingNodesOf(new Error('boom'))).toBeUndefined();
    expect(missingNodesOf(undefined)).toBeUndefined();
    expect(missingNodesOf('text')).toBeUndefined();
    expect(
      missingNodesOf(new FrodoError('Error exporting journeys'))
    ).toBeUndefined();
    expect(
      missingNodesOf(
        new FrodoError('Error exporting the alpha realm journey x')
      )
    ).toBeUndefined();
  });
});
