import { afterEach, describe, expect, it } from '@jest/globals';
import {
  armAuthoringPrint,
  authoringPrintPendingState,
  flushAuthoringPrint,
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
    // Mirrors the realm-pick-then-flush ordering: the resolver arms with a
    // closure over the command object; the realm pick (or editor) mutates
    // it afterwards; the postAction flush must see the mutation.
    let rendered = '';
    armAuthoringPrint();
    setAuthoringPrintFlush(() => {
      rendered = current;
    });
    let current = 'stale';
    current = 'fresh after realm pick';
    flushAuthoringPrint();
    expect(rendered).toBe('fresh after realm pick');
  });
});
