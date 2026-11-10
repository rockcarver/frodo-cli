import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  canPrompt,
  notePromptRendered,
  promptsRendered,
  resetNeverPromptForTests,
  setNeverPrompt,
} from './PromptGateState';
import {
  clearTransientFrame,
  showTransientFrame,
  transientFrameShown,
} from './TransientFrame';

// canPrompt() reads the real process streams. Jest's own stdio under this
// harness is NOT a TTY, so the "genuinely interactive" case can't be
// asserted true here -- that path is covered by the PTY-based manual
// verification of the full prompt layer (and by the e2e suite's inherent
// FRODO_TEST=1 coverage). Everything else is env/flag state, which IS
// fully assertable.
const SAVED_ENV_KEYS = ['FRODO_NO_PROMPT', 'FRODO_TEST'] as const;

afterEach(() => {
  for (const key of SAVED_ENV_KEYS) {
    delete process.env[key];
  }
  resetNeverPromptForTests();
});

describe('PromptGateState.canPrompt', () => {
  it('refuses under FRODO_TEST=1 even when everything else would allow', () => {
    process.env.FRODO_TEST = '1';
    expect(canPrompt()).toBe(false);
  });

  it('refuses under FRODO_NO_PROMPT even when everything else would allow', () => {
    process.env.FRODO_NO_PROMPT = '1';
    expect(canPrompt()).toBe(false);
  });

  it('refuses after setNeverPrompt() (the MCP stdio kill switch)', () => {
    setNeverPrompt();
    expect(canPrompt()).toBe(false);
  });

  it('refuses on the test harness (non-TTY stdio)', () => {
    // No FRODO_TEST, no FRODO_NO_PROMPT, no kill switch -- the only
    // remaining reason to refuse is the non-TTY stdio this suite runs on.
    expect(canPrompt()).toBe(false);
  });
});

describe('PromptGateState.notePromptRendered', () => {
  it('counts the prompt and takes a frame that is drawn without a prompt off the screen first', () => {
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as typeof process.stdout.write);
    try {
      showTransientFrame('busy frame');
      expect(transientFrameShown()).toBe(true);
      const before = promptsRendered();
      notePromptRendered();
      expect(transientFrameShown()).toBe(false);
      expect(promptsRendered()).toBe(before + 1);
    } finally {
      clearTransientFrame();
      write.mockRestore();
    }
  });
});
