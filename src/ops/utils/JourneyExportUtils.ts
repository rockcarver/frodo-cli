import fs from 'fs';
import {
  frodo,
  FrodoError,
  type MultiTreeExportInterface,
} from '@rockcarver/frodo-lib';

const { getFilePath } = frodo.utils;

/**
 * Read a single- or multi-journey export file into the library's multi-tree format.
 * @param file import file name
 * @returns journey export containing one or more trees
 */
export function readJourneyExportFromFile(
  file: string
): MultiTreeExportInterface {
  const fileData = JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
  if (fileData?.trees && typeof fileData.trees === 'object') {
    return fileData;
  }
  if (fileData?.tree && typeof fileData.tree === 'object') {
    const journeyId = fileData.tree._id;
    if (!journeyId) {
      throw new FrodoError(`No journey ID found in ${file}`);
    }
    return { trees: { [journeyId]: fileData } };
  }
  throw new FrodoError(`No journeys found in ${file}`);
}
