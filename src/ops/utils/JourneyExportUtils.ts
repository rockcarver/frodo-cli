import fs from 'fs';
import {
  frodo,
  FrodoError,
  type MultiTreeExportInterface,
  type SingleTreeExportInterface,
} from '@rockcarver/frodo-lib';

const { getFilePath, getWorkingDirectory } = frodo.utils;

export type DuplicateJourneyExport = {
  journeyId: string;
  firstFile: string;
  duplicateFile: string;
};

export type JourneyDirectoryExport = {
  journeysExport: MultiTreeExportInterface;
  duplicateJourneyIds: DuplicateJourneyExport[];
  unsupportedFiles: string[];
};

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

/**
 * Read journey exports from the current working directory.
 * @returns journey exports and any duplicate or unsupported files
 */
export function readJourneyExportsFromDirectory(): JourneyDirectoryExport {
  const journeysExport: MultiTreeExportInterface = { trees: {} };
  const duplicateJourneyIds: DuplicateJourneyExport[] = [];
  const unsupportedFiles: string[] = [];
  const sourceFiles = new Map<string, string>();
  const files = fs
    .readdirSync(getWorkingDirectory())
    .filter((name) => name.toLowerCase().endsWith('.journey.json'))
    .map((name) => getFilePath(name));

  for (const file of files) {
    const fileData = JSON.parse(fs.readFileSync(file, 'utf8'));
    let trees: Record<string, SingleTreeExportInterface>;
    if (fileData?.trees && typeof fileData.trees === 'object') {
      trees = fileData.trees;
    } else if (fileData?.tree?._id) {
      trees = { [fileData.tree._id]: fileData };
    } else {
      unsupportedFiles.push(file);
      continue;
    }

    for (const [journeyId, journey] of Object.entries(trees)) {
      const firstFile = sourceFiles.get(journeyId);
      if (firstFile) {
        duplicateJourneyIds.push({
          journeyId,
          firstFile,
          duplicateFile: file,
        });
      } else {
        sourceFiles.set(journeyId, file);
      }
      journeysExport.trees[journeyId] = journey;
    }
  }

  return { journeysExport, duplicateJourneyIds, unsupportedFiles };
}
