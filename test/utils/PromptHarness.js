/**
 * A stand-in for `@inquirer/core` that lets a unit test render a prompt's
 * view function directly: hooks are index-based like the real ones (a hook
 * added before another shifts its index, which is why the tests that seed
 * state pin the order), `createPrompt` captures the view instead of
 * running it, and `render` calls the view again on the current state.
 *
 * Usage, in a test file (the mock must be registered before the prompt
 * module is imported):
 *
 *   const harness = createPromptHarness();
 *   jest.unstable_mockModule('@inquirer/core', () => harness.module);
 *   const view = await harness.load(() => import('../../src/...Prompt.ts'));
 *   harness.render(view, config);
 *
 * Shared by every prompt's frame test (see FrameAssertions.js).
 */
export function createPromptHarness() {
  const harness = {
    /** Hook state by useState call order; seed it before `render`. */
    states: [],
    /** The view functions `createPrompt` has captured, in module load order. */
    views: [],
    /** Effects registered by the last render, in call order. */
    effects: [],
    /** The handler the last render registered with `useKeypress`. */
    keypress: undefined,
    refs: [],
    stateIndex: 0,
    refIndex: 0,
  };

  harness.module = {
    createPrompt: (view) => {
      harness.views.push(view);
      return () => {};
    },
    ExitPromptError: class extends Error {},
    isDownKey: (key) => key.name === 'down',
    isUpKey: (key) => key.name === 'up',
    isEnterKey: (key) => key.name === 'enter',
    isSpaceKey: (key) => key.name === 'space',
    useEffect: (effect) => {
      harness.effects.push(effect);
    },
    useKeypress: (handler) => {
      harness.keypress = handler;
    },
    useMemo: (compute) => compute(),
    usePagination: ({ items, active, renderItem }) =>
      items
        .map((item, index) =>
          renderItem({ item, index, isActive: index === active })
        )
        .join('\n'),
    usePrefix: () => '?',
    useRef: (initial) => {
      const index = harness.refIndex++;
      harness.refs[index] ??= { current: initial };
      return harness.refs[index];
    },
    useState: (initial) => {
      const index = harness.stateIndex++;
      if (!(index in harness.states)) {
        harness.states[index] =
          typeof initial === 'function' ? initial() : initial;
      }
      return [
        harness.states[index],
        (value) => {
          // Functional updates apply to the current state, as in inquirer.
          harness.states[index] =
            typeof value === 'function' ? value(harness.states[index]) : value;
        },
      ];
    },
  };

  /** Imports a prompt module and returns the view its `createPrompt` call captured. */
  harness.load = async (importModule) => {
    const before = harness.views.length;
    await importModule();
    return harness.views[before];
  };

  /** Forgets all hook state (call between scenarios). */
  harness.reset = () => {
    harness.states = [];
    harness.refs = [];
    harness.effects = [];
    harness.keypress = undefined;
  };

  /** Renders the view once more on the current state. */
  harness.render = (view, ...args) => {
    harness.stateIndex = 0;
    harness.refIndex = 0;
    harness.effects = [];
    return view(...args, () => {});
  };

  return harness;
}
