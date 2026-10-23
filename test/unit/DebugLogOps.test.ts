import { describe, expect, it } from '@jest/globals';
import type { LogEventSkeleton } from '@rockcarver/frodo-lib';
import {
  compactFailureReason,
  decodeHtmlEntities,
  formatDebugEvent,
} from '../../src/ops/DebugLogOps';

/**
 * The debug tail's formatting layer (DebugLogOps): audit events render as
 * compact topic lines, raw debug-log lines (am-core) render level +
 * short-logger + compacted message, and everything else filters out.
 * Jest runs NO_COLOR, so plain string equality is the whole contract.
 */
function event(payload: unknown, source?: string): LogEventSkeleton {
  return {
    source,
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  } as LogEventSkeleton;
}

describe('formatDebugEvent - debug-log lines (am-core, no component/eventName)', () => {
  const amCoreLine = {
    level: 'ERROR',
    logger: 'org.forgerock.openam.auth.nodes.ScriptedDecisionNode',
    message:
      'javax.script.ScriptException: ReferenceError: "x" is not defined. (script#2) in script at line number 2 at column number 0',
    transactionId: 'tx-1',
  };

  it('renders level + short logger + compacted message', () => {
    expect(formatDebugEvent(event(amCoreLine), 'all')).toBe(
      'ERROR ScriptedDecisionNode: ReferenceError: "x" is not defined (script:2)'
    );
  });

  it('filters out INFO/DEBUG am-core traffic (aggregator discipline)', () => {
    expect(
      formatDebugEvent(event({ ...amCoreLine, level: 'INFO' }), 'all')
    ).toBeUndefined();
    expect(
      formatDebugEvent(event({ ...amCoreLine, level: 'DEBUG' }), 'all')
    ).toBeUndefined();
  });

  it('falls back to the exception headline, one line, when there is no message', () => {
    const { message: _message, ...noMessage } = amCoreLine;
    const line = formatDebugEvent(
      event({
        ...noMessage,
        exception:
          'TypeError: Cannot call method "get" of null (script#62)\n\tat java.base/java.util.concurrent.FutureTask.report(FutureTask.java:124)\n\tat org.forgerock.openam.scripting.ThreadPoolScriptEvaluator.evaluateScript(ThreadPoolScriptEvaluator.java:98)',
      }),
      'all'
    );
    expect(line).toBe(
      'ERROR ScriptedDecisionNode: TypeError: Cannot call method "get" of null (script#62)'
    );
  });

  it('skips leading blank lines when picking the exception headline', () => {
    const { message: _message, ...noMessage } = amCoreLine;
    expect(
      formatDebugEvent(
        event({ ...noMessage, exception: '\n  \nRealError: x\n\tat y' }),
        'all'
      )
    ).toBe('ERROR ScriptedDecisionNode: RealError: x');
  });

  it('bounds a very long exception headline', () => {
    const { message: _message, ...noMessage } = amCoreLine;
    const line = formatDebugEvent(
      event({ ...noMessage, exception: 'x'.repeat(500) }),
      'all'
    );
    expect(line).toBe(`ERROR ScriptedDecisionNode: ${'x'.repeat(159)}…`);
  });

  it('collapses line breaks and tabs inside a message to one line', () => {
    const line = formatDebugEvent(
      event({
        ...amCoreLine,
        message: 'first problem\n\tsecond problem\r\nthird problem',
      }),
      'all'
    );
    expect(line).toBe(
      'ERROR ScriptedDecisionNode: first problem second problem third problem'
    );
  });

  it('warns render too, with the same shape', () => {
    expect(
      formatDebugEvent(
        event({
          ...amCoreLine,
          level: 'WARN',
          message: 'error evaluating the script',
        }),
        'all'
      )
    ).toBe('WARN ScriptedDecisionNode: error evaluating the script');
  });
});

describe('formatDebugEvent - audit fallback', () => {
  it('renders a recognized-but-untransformed audit event generically', () => {
    expect(
      formatDebugEvent(
        event({
          component: 'SAML2',
          eventName: 'AM-SAML2-REQUEST',
          result: 'SUCCESSFUL',
          realm: '/alpha',
        }),
        'saml'
      )
    ).toBe('AM-SAML2-REQUEST SUCCESSFUL realm=/alpha');
  });

  it('filters events outside the topic', () => {
    expect(
      formatDebugEvent(
        event({ component: 'OAuth', eventName: 'AM-ACCESS-OUTCOME' }),
        'sync'
      )
    ).toBeUndefined();
  });
});

describe('compactFailureReason', () => {
  it('compacts the live-verified ScriptException chain to the useful part', () => {
    expect(
      compactFailureReason(
        'javax.script.ScriptException: java.util.concurrent.ExecutionException: ' +
          'javax.script.ScriptException: ReferenceError: "x" is not defined. ' +
          '(scriptName#2) in scriptName at line number 2 at column number 0'
      )
    ).toBe('ReferenceError: "x" is not defined (scriptName:2)');
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes the entities AM encodes failure strings with', () => {
    expect(decodeHtmlEntities('entry &#39;fr-idm-uuid&#61;x&#39; gone')).toBe(
      "entry 'fr-idm-uuid=x' gone"
    );
  });
});
