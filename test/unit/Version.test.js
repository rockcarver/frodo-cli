import fs from 'fs';
import os from 'os';
import { jest } from '@jest/globals';
import pkg from '../../package.json' with { type: 'json' };

jest.unstable_mockModule('../../src/utils/Config', () => ({
  getConfigPath: () => `${os.homedir()}/.frodo`,
}));

const getAllVersions = jest.fn();
jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    utils: {
      version: {
        getVersion: () => '5.0.0',
        getBuildTimestamp: () => 'library-build',
        getAllVersions,
      },
    },
  },
}));

const cacheFile = `${os.homedir()}/.frodo/Versions.json`;
const settingsFile = `${os.homedir()}/.frodo/UpdateCheck.json`;
const airGapFile = `${os.homedir()}/.frodo/AirGap.json`;
const now = 2000000000;
const newerVersion = '999.0.0';
const originalEnv = process.env.FRODO_NO_UPDATE_CHECK;
const originalAirGapEnv = process.env.FRODO_AIRGAPPED;
let getVersions;

beforeEach(async () => {
  jest.resetModules();
  getAllVersions.mockReset();
  delete process.env.FRODO_NO_UPDATE_CHECK;
  delete process.env.FRODO_AIRGAPPED;
  ({ getVersions } = await import('../../src/utils/Version'));
  jest.spyOn(Date, 'now').mockReturnValue(now * 1000);
  jest.spyOn(fs, 'existsSync').mockReturnValue(false);
  jest.spyOn(fs, 'readFileSync').mockImplementation(() =>
    JSON.stringify({
      last_checked: now,
      github: newerVersion,
      npm: newerVersion,
    })
  );
  jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
  getAllVersions.mockResolvedValue([
    {
      value: {
        data: [
          {
            prerelease: false,
            tag_name: `v${newerVersion}`,
            published_at: 'release-date',
          },
        ],
      },
    },
    {
      value: {
        data: {
          'dist-tags': { latest: newerVersion },
          time: { [newerVersion]: 'release-date' },
        },
      },
    },
  ]);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalEnv === undefined) delete process.env.FRODO_NO_UPDATE_CHECK;
  else process.env.FRODO_NO_UPDATE_CHECK = originalEnv;
  if (originalAirGapEnv === undefined) delete process.env.FRODO_AIRGAPPED;
  else process.env.FRODO_AIRGAPPED = originalAirGapEnv;
});

function expectInstalledVersions(text, installation = 'NPM package') {
  expect(text).toContain(`You are running the ${installation}.`);
  expect(text).toContain(`cli: v${pkg.version} (`);
  expect(text).toContain('lib: v5.0.0 (library-build)');
  expect(text).toContain(`node: ${process.version}`);
  expect(text).not.toContain('Newer version(s) available');
}

function expectNoUpdateIO() {
  expect(getAllVersions).not.toHaveBeenCalled();
  expect(fs.existsSync).not.toHaveBeenCalled();
  expect(fs.readFileSync).not.toHaveBeenCalled();
  expect(fs.writeFileSync).not.toHaveBeenCalled();
}

test.each(['1', 'true', 'yes', 'on', 'TRUE', 'Yes', 'ON', 'tRuE'])(
  'FRODO_NO_UPDATE_CHECK=%s skips network, cache and notices',
  async (value) => {
    process.env.FRODO_NO_UPDATE_CHECK = value;
    expectInstalledVersions(await getVersions(false));
    expect(await getVersions(true)).toBe('');
    expectNoUpdateIO();
  }
);

test.each([
  ['/tmp/frodo', 'binary release'],
  ['/tmp/frodo.exe', 'binary release'],
  ['/opt/homebrew/bin/frodo', 'homebrew release'],
])(
  'opt-out preserves installation information for %s',
  async (execPath, label) => {
    jest.replaceProperty(process, 'execPath', execPath);
    process.env.FRODO_NO_UPDATE_CHECK = '1';
    expectInstalledVersions(await getVersions(false), label);
    expect(await getVersions(true)).toBe('');
    expectNoUpdateIO();
  }
);

test('opt-out ignores remote data retained by an earlier call', async () => {
  expect(await getVersions(true)).toContain(
    'A new version of frodo is available'
  );
  jest.clearAllMocks();
  process.env.FRODO_NO_UPDATE_CHECK = 'true';
  expectInstalledVersions(await getVersions(false));
  expect(await getVersions(true)).toBe('');
  expectNoUpdateIO();
});

test.each([undefined, '', '0', 'false', 'no', 'off', ' true ', 'enabled'])(
  'FRODO_NO_UPDATE_CHECK=%s leaves update checks enabled',
  async (value) => {
    if (value !== undefined) process.env.FRODO_NO_UPDATE_CHECK = value;
    expect(await getVersions(false)).toContain('Newer version(s) available');
    expect(getAllVersions).toHaveBeenCalledTimes(1);
    expect(getAllVersions).toHaveBeenCalledWith([
      {
        base: 'https://api.github.com',
        path: '/repos/rockcarver/frodo-cli/releases',
      },
      {
        base: 'https://registry.npmjs.org',
        path: '/@rockcarver/frodo-cli',
      },
    ]);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      cacheFile,
      JSON.stringify(
        { last_checked: now, github: newerVersion, npm: newerVersion },
        null,
        2
      )
    );
  }
);

test('uses cached versions within 24 hours', async () => {
  fs.existsSync.mockReturnValue(true);
  fs.readFileSync.mockReturnValue(
    JSON.stringify({
      last_checked: now - 86399,
      github: newerVersion,
      npm: newerVersion,
    })
  );
  expect(await getVersions(false)).toContain('Newer version(s) available');
  expect(await getVersions(true)).toContain(
    'A new version of frodo is available'
  );
  expect(fs.readFileSync).toHaveBeenCalledWith(cacheFile, 'utf8');
  expect(getAllVersions).not.toHaveBeenCalled();
  expect(fs.writeFileSync).not.toHaveBeenCalled();
});

test('refreshes cached versions after 24 hours', async () => {
  fs.existsSync.mockReturnValue(true);
  fs.readFileSync.mockReturnValue(
    JSON.stringify({ last_checked: now - 86401, github: '1.0.0', npm: '1.0.0' })
  );
  expect(await getVersions(false)).toContain('Newer version(s) available');
  expect(fs.readFileSync).toHaveBeenCalledWith(cacheFile, 'utf8');
  expect(getAllVersions).toHaveBeenCalledTimes(1);
  expect(fs.writeFileSync).toHaveBeenCalledWith(
    cacheFile,
    JSON.stringify(
      { last_checked: now, github: newerVersion, npm: newerVersion },
      null,
      2
    )
  );
});

test('network failures silently preserve installed versions', async () => {
  getAllVersions.mockRejectedValue(new Error('offline'));
  expectInstalledVersions(await getVersions(false));
  expect(await getVersions(true)).toBe('');
  expect(getAllVersions).toHaveBeenCalled();
  expect(fs.writeFileSync).not.toHaveBeenCalled();
});

test.each([undefined, 'false', 'true'])(
  'persisted opt-out skips network and version-cache IO with env=%s',
  async (value) => {
    if (value !== undefined) process.env.FRODO_NO_UPDATE_CHECK = value;
    fs.readFileSync.mockReturnValue('{"enabled":false}');
    expectInstalledVersions(await getVersions(false));
    expect(await getVersions(true)).toBe('');
    expect(getAllVersions).not.toHaveBeenCalled();
    expect(fs.existsSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    if (value === 'true') {
      expect(fs.readFileSync).not.toHaveBeenCalled();
    } else {
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
      expect(fs.readFileSync).toHaveBeenCalledWith(settingsFile, 'utf8');
    }
  }
);

test.each(['{', 'null', '{"enabled":"false"}', '{"enabled":true}', undefined])(
  'invalid, enabled or missing setting %s leaves update checks enabled',
  async (contents) => {
    fs.readFileSync.mockImplementation((file) => {
      // the air-gap setting is read too (cli#1307) and is absent here
      if (file === airGapFile) throw new Error('ENOENT');
      if (contents === undefined) throw new Error('ENOENT');
      return contents;
    });
    expect(await getVersions(false)).toContain('Newer version(s) available');
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync).toHaveBeenCalledWith(settingsFile, 'utf8');
    expect(fs.readFileSync).toHaveBeenCalledWith(airGapFile, 'utf8');
    expect(getAllVersions).toHaveBeenCalledTimes(1);
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(fs.writeFileSync.mock.calls[0][0]).toBe(cacheFile);
  }
);

test('persisted opt-out ignores remote data retained by an earlier call', async () => {
  expect(await getVersions(true)).toContain(
    'A new version of frodo is available'
  );
  jest.clearAllMocks();
  fs.readFileSync.mockReturnValue('{"enabled":false}');
  expectInstalledVersions(await getVersions(false));
  expect(await getVersions(true)).toBe('');
  expect(getAllVersions).not.toHaveBeenCalled();
  expect(fs.existsSync).not.toHaveBeenCalled();
  expect(fs.writeFileSync).not.toHaveBeenCalled();
});

test.each(['1', 'true', 'TRUE', 'yes', 'on'])(
  'air-gapped mode by FRODO_AIRGAPPED=%s skips network and version-cache IO',
  async (value) => {
    process.env.FRODO_AIRGAPPED = value;
    // a retained cache and an enabled update check must not matter
    expectInstalledVersions(await getVersions(false));
    expect(await getVersions(true)).toBe('');
    expect(getAllVersions).not.toHaveBeenCalled();
    expect(fs.existsSync).not.toHaveBeenCalledWith(cacheFile);
    expect(fs.readFileSync).not.toHaveBeenCalledWith(cacheFile, 'utf8');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  }
);

test.each(['0', 'false', 'off', '', 'no'])(
  'FRODO_AIRGAPPED=%j does not switch air-gapped mode on',
  async (value) => {
    process.env.FRODO_AIRGAPPED = value;
    fs.readFileSync.mockImplementation((file) => {
      if (file === airGapFile || file === settingsFile)
        throw new Error('ENOENT');
      return JSON.stringify({
        last_checked: now,
        github: newerVersion,
        npm: newerVersion,
      });
    });
    expect(await getVersions(false)).toContain('Newer version(s) available');
  }
);

test('air-gapped mode by the persisted setting skips network and version-cache IO', async () => {
  fs.readFileSync.mockImplementation((file) => {
    if (file === airGapFile) return '{"enabled":true}';
    if (file === settingsFile) throw new Error('ENOENT');
    return JSON.stringify({
      last_checked: now,
      github: newerVersion,
      npm: newerVersion,
    });
  });
  expectInstalledVersions(await getVersions(false));
  expect(await getVersions(true)).toBe('');
  expect(getAllVersions).not.toHaveBeenCalled();
  expect(fs.existsSync).not.toHaveBeenCalled();
  expect(fs.readFileSync).not.toHaveBeenCalledWith(cacheFile, 'utf8');
  expect(fs.writeFileSync).not.toHaveBeenCalled();
});

test('air-gapped mode ignores remote data retained by an earlier call', async () => {
  expect(await getVersions(true)).toContain(
    'A new version of frodo is available'
  );
  jest.clearAllMocks();
  process.env.FRODO_AIRGAPPED = '1';
  expectInstalledVersions(await getVersions(false));
  expect(await getVersions(true)).toBe('');
  expect(getAllVersions).not.toHaveBeenCalled();
  expect(fs.writeFileSync).not.toHaveBeenCalled();
});
