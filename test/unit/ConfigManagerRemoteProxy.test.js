import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const readConfigEntity = jest.fn();
const getFilePath = jest.fn();
const saveJsonToFile = jest.fn();
const printError = jest.fn();

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  frodo: {
    idm: { config: { readConfigEntity } },
    utils: { getFilePath, saveJsonToFile },
  },
}));

jest.unstable_mockModule('../../src/utils/Console', () => ({ printError }));

const { exportIdmRemoteProxyConfig } =
  await import('../../src/ops/ConfigManagerRemoteProxyOps');

describe('exportIdmRemoteProxyConfig', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    getFilePath.mockReturnValue('out/remote/http.json');
  });

  it('exports the IDM remote HTTP proxy configuration', async () => {
    const config = { _id: 'remote/http', url: 'https://example.com' };
    readConfigEntity.mockResolvedValue(config);

    await expect(exportIdmRemoteProxyConfig()).resolves.toBe(true);

    expect(readConfigEntity).toHaveBeenCalledWith('remote/http');
    expect(getFilePath).toHaveBeenCalledWith('remote/http.json', true);
    expect(saveJsonToFile).toHaveBeenCalledWith(
      config,
      'out/remote/http.json',
      false
    );
    expect(printError).not.toHaveBeenCalled();
  });

  it('reports a failed config read', async () => {
    const error = new Error('unavailable');
    readConfigEntity.mockRejectedValue(error);

    await expect(exportIdmRemoteProxyConfig()).resolves.toBe(false);

    expect(saveJsonToFile).not.toHaveBeenCalled();
    expect(printError).toHaveBeenCalledWith(
      error,
      'Error exporting IDM remote proxy config'
    );
  });
});
