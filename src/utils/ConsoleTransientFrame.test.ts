import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { state } from '@rockcarver/frodo-lib';
import { debugMessage, printMessage, verboseMessage } from './Console';
import {
  clearTransientFrame,
  showTransientFrame,
  transientFrameShown,
} from './interactive/TransientFrame';

// Decision record 0046: the connection page leaves a frame on the screen while
// the login runs, and whatever the login prints takes it away first, so a
// message lands on a clean screen and nothing is erased by line count
// afterwards. printMessage is the funnel of the library's print handler;
// verboseMessage and debugMessage write on their own.
describe('the writers of Console take a transient frame off the screen first', () => {
  let log: string[];
  const ERASE = '\x1b[2K';

  beforeEach(() => {
    log = [];
    jest.spyOn(process.stdout, 'write').mockImplementation(((text: string) => {
      log.push(`screen:${text}`);
      return true;
    }) as typeof process.stdout.write);
    jest.spyOn(console, 'error').mockImplementation(((text: string) => {
      log.push(`message:${text}`);
    }) as typeof console.error);
    showTransientFrame('Logging in...');
    log.length = 0;
  });

  afterEach(() => {
    clearTransientFrame();
    state.setVerbose(false);
    state.setDebug(false);
    jest.restoreAllMocks();
  });

  /** The frame is erased before the message is written. */
  function expectErasedFirst(message: string): void {
    expect(transientFrameShown()).toBe(false);
    const erased = log.findIndex((entry) => entry.includes(ERASE));
    const written = log.findIndex((entry) => entry === `message:${message}`);
    expect(erased).toBeGreaterThan(-1);
    expect(written).toBeGreaterThan(-1);
    expect(erased).toBeLessThan(written);
  }

  it('printMessage', () => {
    printMessage('Opening browser to complete login...');
    expectErasedFirst('Opening browser to complete login...');
  });

  it('verboseMessage, when verbose output is on', () => {
    state.setVerbose(true);
    verboseMessage('Connected to the tenant');
    expectErasedFirst('Connected to the tenant');
  });

  it('debugMessage, when debug output is on', () => {
    state.setDebug(true);
    debugMessage('a debug line');
    expect(transientFrameShown()).toBe(false);
    expect(log.findIndex((entry) => entry.includes(ERASE))).toBeGreaterThan(-1);
  });

  it('leaves the frame alone when verbose output is off: nothing is written', () => {
    state.setVerbose(false);
    verboseMessage('not shown');
    expect(transientFrameShown()).toBe(true);
    expect(log).toEqual([]);
  });
});
