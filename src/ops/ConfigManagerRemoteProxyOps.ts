import { frodo } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { readConfigEntity } = frodo.idm.config;
const { getFilePath, saveJsonToFile } = frodo.utils;

export async function exportIdmRemoteProxyConfig(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity('remote/http');
    saveJsonToFile(exportData, getFilePath('remote/http.json', true), false);
    return true;
  } catch (error) {
    printError(error, 'Error exporting IDM remote proxy config');
  }
  return false;
}
