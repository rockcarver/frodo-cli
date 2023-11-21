import { frodo, state } from '@rockcarver/frodo-lib';
import {
  FullExportInterface,
  FullExportOptions,
} from '@rockcarver/frodo-lib/types/ops/AdminOps';
import fs from 'fs';

import { ScriptExportInterface } from '../../../frodo-lib/types/ops/ScriptOps';
import { extractScriptToFile } from './ScriptOps';

const {
  getRealmName,
  getTypedFilename,
  titleCase,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
const { exportFullConfiguration } = frodo.admin;

/**
 * Export everything to separate files
 * @param file file name
 * @param {FullExportOptions} options export options
 */
export async function exportEverythingToFile(
  file,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
  }
): Promise<void> {
  const exportData = await exportFullConfiguration(options);
  let fileName = getTypedFilename(
    `${titleCase(getRealmName(state.getRealm()))}`,
    `everything`
  );
  if (file) {
    fileName = file;
  }
  saveJsonToFile(exportData, getFilePath(fileName, true));
}

/**
 * Export everything to separate files
 * @param extract Extracts the scripts from the exports into separate files if true
 * @param {FullExportOptions} options export options
 */
export async function exportEverythingToFiles(
  extract = false,
  options: FullExportOptions = {
    useStringArrays: true,
    noDecode: false,
  }
): Promise<void> {
  const exportData: FullExportInterface =
    await exportFullConfiguration(options);
  delete exportData.meta;
  const baseDirectory = getWorkingDirectory(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.entries(exportData).forEach(([type, obj]: [string, any]) => {
    if (obj) {
      if (!fs.existsSync(`${baseDirectory}/${type}`)) {
        fs.mkdirSync(`${baseDirectory}/${type}`);
      }
      if (type == 'saml') {
        const samlData = {
          saml: {
            cot: {},
            hosted: {},
            metadata: {},
            remote: {},
          },
        };
        if (obj.cot) {
          if (!fs.existsSync(`${baseDirectory}/cot`)) {
            fs.mkdirSync(`${baseDirectory}/cot`);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Object.entries(obj.cot).forEach(([id, value]: [string, any]) => {
            samlData.saml.cot = {
              [id]: value,
            };
            saveJsonToFile(
              samlData,
              `${baseDirectory}/cot/${getTypedFilename(id, 'cot.saml')}`
            );
          });
          samlData.saml.cot = {};
        }
        Object.entries(obj.hosted)
          .concat(Object.entries(obj.remote))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .forEach(([id, value]: [string, any]) => {
            const filename = getTypedFilename(
              value.entityId ? value.entityId : id,
              type
            );
            const samlType = obj.hosted[id] ? 'hosted' : 'remote';
            samlData.saml[samlType][id] = value;
            samlData.saml.metadata = {
              [id]: obj.metadata[id],
            };
            saveJsonToFile(samlData, `${baseDirectory}/${type}/${filename}`);
            samlData.saml[samlType] = {};
          });
      } else if (type == 'authentication') {
        const fileName = getTypedFilename(
          `${frodo.utils.getRealmName(state.getRealm())}Realm`,
          'authentication.settings'
        );
        saveJsonToFile(
          {
            authentication: obj,
          },
          `${baseDirectory}/${type}/${fileName}`
        );
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Object.entries(obj).forEach(([id, value]: [string, any]) => {
          const filename =
            type == 'config'
              ? `${id}.json`
              : getTypedFilename(value.name ? value.name : id, type);
          if (type == 'config' && filename.includes('/')) {
            fs.mkdirSync(
              `${baseDirectory}/${type}/${filename.slice(
                0,
                filename.lastIndexOf('/')
              )}`,
              {
                recursive: true,
              }
            );
          }
          if (extract && type == 'script') {
            extractScriptToFile(exportData as ScriptExportInterface, id, type);
          }
          saveJsonToFile(
            {
              [type]: {
                [id]: value,
              },
            },
            `${baseDirectory}/${type}/${filename}`
          );
        });
      }
    }
  });
}
