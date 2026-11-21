import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { FrodoError, httpError } from '../utils/LibErrorShapes.js';

/**
 * `frodo journey enable` and `frodo journey disable`: when the tenant refuses to
 * save the journey, the command prints the cause, once, after the line that says
 * the journey could not be enabled or disabled, and fails. `disable` used to
 * print only that line: its `catch` block did not print the error the library
 * had thrown, so the reason the tenant gave was lost (it still returned false
 * and the command still exited 1). It now prints the cause, as `enable` always
 * did, and the tests below hold both commands to the same output.
 *
 * The functions under test are the ones of src/ops/JourneyOps.ts. The library is
 * a double (its bundled ESM cannot load under jest's ESM runtime) and so are
 * the other ops modules; the console module is the real one, so the test reads
 * what the person would see on the error stream.
 */

const enableJourney = jest.fn();
const disableJourney = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  FrodoError,
  frodo: {
    authn: { journey: { enableJourney, disableJourney }, node: {} },
    utils: {},
  },
  state: {
    getVerbose: () => false,
    getDebug: () => false,
    getOutputFile: () => undefined,
  },
}));
jest.unstable_mockModule('../../src/utils/ColorTheme', () => ({
  default: new Proxy({}, { get: () => (text) => text }),
}));
for (const modulePath of [
  '../../src/ops/CirclesOfTrustOps',
  '../../src/ops/EmailTemplateOps',
  '../../src/ops/IdpOps',
  '../../src/ops/NodeOps',
  '../../src/ops/Saml2Ops',
  '../../src/ops/ScriptOps',
  '../../src/ops/ThemeOps',
]) {
  jest.unstable_mockModule(modulePath, () => ({}));
}
jest.unstable_mockModule('../../src/ops/utils/Wordwrap', () => ({
  default: (text) => text,
}));

const { enableJourney: enable, disableJourney: disable } =
  await import('../../src/ops/JourneyOps');

/** What the library throws when the PUT of the tree is refused. */
function refusal(verb) {
  return new FrodoError(
    `Error ${verb} alpha realm journey Login`,
    httpError(
      'https://openam-matrix.example.com/am/json/realms/root/realms/alpha/realm-config/authentication/authenticationtrees/trees/Login',
      500,
      {
        code: 500,
        reason: 'Internal Server Error',
        message: 'The tenant could not save the journey',
      }
    )
  );
}

const COMMANDS = [
  {
    name: 'enable',
    run: enable,
    library: enableJourney,
    verb: 'enabling',
    done: 'Enabled journey Login.',
    failed: 'Error enabling journey Login',
  },
  {
    name: 'disable',
    run: disable,
    library: disableJourney,
    verb: 'disabling',
    done: 'Disabled journey Login.',
    failed: 'Error disabling journey Login',
  },
];

describe.each(COMMANDS)(
  'journey $name',
  ({ name, run, library, verb, done, failed }) => {
    let lines;
    const printed = () => lines.join('\n');

    beforeEach(() => {
      lines = [];
      library.mockReset();
      jest
        .spyOn(console, 'error')
        .mockImplementation((text) => lines.push(String(text)));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('succeeds with one line and nothing else', async () => {
      library.mockResolvedValue(undefined);

      expect(await run('Login')).toBe(true);

      expect(library.mock.calls).toEqual([['Login']]);
      expect(lines).toEqual([`✔ ${done}`]);
    });

    test('prints the cause of a refusal once, after the line that says it failed, and fails', async () => {
      library.mockRejectedValue(refusal(verb));

      expect(await run('Login')).toBe(false);

      expect(library.mock.calls).toEqual([['Login']]);
      expect(lines[0]).toBe(`✖ ${failed}`);
      const cause = lines.slice(1).join('\n');
      expect(cause).toContain(`Error ${verb} alpha realm journey Login`);
      expect(cause).toContain('Status: 500');
      expect(cause).toContain('Reason: Internal Server Error');
      expect(cause).toContain('Message: The tenant could not save the journey');
      expect(printed().match(/Status: 500/g)).toHaveLength(1);
    });

    test('prints the message of an error that is not the error of the library', async () => {
      library.mockRejectedValue(new Error('connect ECONNREFUSED'));

      expect(await run('Login')).toBe(false);

      expect(lines).toEqual([`✖ ${failed}`, 'connect ECONNREFUSED']);
    });

    test(`says ${name} in its own words and no other command's`, async () => {
      library.mockRejectedValue(refusal(verb));

      await run('Login');

      const other = name === 'enable' ? /disabl/i : /enabl/i;
      expect(printed()).not.toMatch(other);
    });
  }
);

describe('journey enable and journey disable', () => {
  beforeEach(() => {
    enableJourney.mockReset();
    disableJourney.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('print the same lines for the same failure, apart from the verb', async () => {
    const output = {};
    for (const { name, run, library, verb } of COMMANDS) {
      const lines = [];
      jest
        .spyOn(console, 'error')
        .mockImplementation((text) => lines.push(String(text)));
      library.mockRejectedValue(refusal(verb));
      await run('Login');
      jest.restoreAllMocks();
      output[name] = lines
        .join('\n')
        .replace(/dis(abl)/g, 'en$1')
        .replace(/Dis(abl)/g, 'En$1');
    }

    expect(output.disable).toBe(output.enable);
  });
});
