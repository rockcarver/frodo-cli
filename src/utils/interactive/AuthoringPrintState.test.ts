import { afterEach, describe, expect, it } from '@jest/globals';
import {
  armAuthoringPrint,
  authoringPrintPendingState,
  authSucceededForFlush,
  flushAuthoringPrint,
  noteAuthSucceeded,
  resetAuthoringPrintForTests,
  setAuthoringPrintFlush,
} from './AuthoringPrintState';

/**
 * The deferred authoring print's state machine: arm -> (any number of
 * no-op flushes) -> one flush -> subsequent flushes no-op. Zero-import
 * module, so these run without mocks.
 */
afterEach(() => {
  resetAuthoringPrintForTests();
});

describe('AuthoringPrintState', () => {
  it('flush does nothing when never armed', () => {
    let flushed = 0;
    setAuthoringPrintFlush(() => {
      flushed += 1;
    });
    flushAuthoringPrint();
    expect(flushed).toBe(0);
  });

  it('prints exactly once, then subsequent flushes no-op', () => {
    let flushed = 0;
    armAuthoringPrint();
    setAuthoringPrintFlush(() => {
      flushed += 1;
    });
    expect(authoringPrintPendingState()).toBe(true);
    flushAuthoringPrint();
    flushAuthoringPrint(); // e.g. entity picks re-flush after getTokens
    flushAuthoringPrint();
    expect(flushed).toBe(1);
    expect(authoringPrintPendingState()).toBe(false);
  });

  it('flush is a no-op without a registered closure (defensive)', () => {
    armAuthoringPrint();
    expect(() => flushAuthoringPrint()).not.toThrow();
    expect(authoringPrintPendingState()).toBe(false);
  });

  it('the closure reads command state at FLUSH time, not arm time', () => {
    // The resolver arms with a closure over the command object; a later
    // interactive edit mutates it; the postAction flush must see the update.
    let rendered = '';
    armAuthoringPrint();
    setAuthoringPrintFlush(() => {
      rendered = current;
    });
    let current = 'stale';
    current = 'fresh after edit';
    flushAuthoringPrint();
    expect(rendered).toBe('fresh after edit');
  });

  it('authSucceeded starts false (pick-first flows must not print pre-auth)', () => {
    expect(authSucceededForFlush()).toBe(false);
    noteAuthSucceeded();
    expect(authSucceededForFlush()).toBe(true);
  });

  it('reset clears the auth flag', () => {
    noteAuthSucceeded();
    resetAuthoringPrintForTests();
    expect(authSucceededForFlush()).toBe(false);
  });
});
