import { jest } from '@jest/globals';
import { Command, Option } from 'commander';

const tailLogs = jest.fn();
const ensureLogApiCredentials = jest.fn(async () => true);
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    cloud: { log: { resolveLevel: () => ['ALL'] } },
    utils: { constants: { CLOUD_DEPLOYMENT_TYPE_KEY: 'cloud' } },
  },
  state: { getHost: () => 'https://tenant.example.com' },
}));
jest.unstable_mockModule('../../src/cli/FrodoCommand', () => ({
  FrodoCommand: class extends Command {
    constructor(name) {
      super(name);
      this.argument('[host]').argument('[username]').argument('[password]');
      this.exitOverride();
    }
    handleDefaultArgsAndOpts() {}
  },
}));
jest.unstable_mockModule('../../src/cli/log/log', () => ({
  sourcesOptionM: new Option('-c, --sources <sources>').default('am-core'),
}));
jest.unstable_mockModule('../../src/utils/Config', () => ({
  FRODO_LOG_NOISEFILTER_FILENAME: 'LoggingNoiseFilter.json',
  getNoiseFilters: () => [],
}));
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: jest.fn(),
}));
jest.unstable_mockModule('../../src/ops/LogOps', () => ({
  tailLogs,
  ensureLogApiCredentials,
}));

const { default: setup } = await import('../../src/cli/log/log-tail');
let exitCode;
beforeEach(() => {
  exitCode = process.exitCode;
  process.exitCode = undefined;
  jest.clearAllMocks();
  tailLogs.mockResolvedValue(false);
});
afterEach(() => {
  process.exitCode = exitCode;
});

test.each([false, true])(
  'the command propagates terminal tail failure as exit code 1 (%j)',
  async (keepTrying) => {
    const flags = keepTrying ? ['--keep-trying'] : [];
    await setup().parseAsync(['tenant', ...flags], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(tailLogs).toHaveBeenCalledWith(
      'am-core',
      ['ALL'],
      undefined,
      [],
      undefined,
      { keepTrying: flags.length ? true : undefined }
    );
  }
);

test('--keep-trying is a separate option with rate-limit help', () => {
  const command = setup();
  expect(
    command.options.find((option) => option.long === '--allow-failures')
  ).toBeUndefined();
  const option = command.options.find(
    (option) => option.long === '--keep-trying'
  );
  expect(option.description).toContain('until Ctrl-C');
  expect(option.description).toContain('refused credentials');
  expect(option.description).toContain(
    '60 requests per minute per environment'
  );
  expect(option.description).toContain('shared with other readers');
  expect(option.description).toContain('about 12');
});
