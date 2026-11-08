import {
  frodo,
  FrodoError,
  state,
  type DeleteJourneysStatus,
  type MultiTreeExportInterface,
  type NodeSkeleton,
  type SingleTreeExportInterface,
  type TreeDependencyMapInterface,
  type TreeExportOptions,
  type TreeExportResolverInterface,
  type TreeImportOptions,
  type TreeSkeleton,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
  verboseMessage,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { describeFailure, OperationRun } from '../utils/OperationRun';
import * as CirclesOfTrust from './CirclesOfTrustOps';
import * as EmailTemplate from './EmailTemplateOps';
import * as Idp from './IdpOps';
import * as Node from './NodeOps';
import * as Saml2 from './Saml2Ops';
import * as Script from './ScriptOps';
import * as Theme from './ThemeOps';
import {
  readJourneyExportFromFile,
  readJourneyExportsFromDirectory,
} from './utils/JourneyExportUtils';
import wordwrap from './utils/Wordwrap';

const {
  getTypedFilename,
  saveJsonToFile,
  saveTextToFile,
  getRealmString,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
const {
  readJourneys,
  exportJourney,
  exportJourneys,
  resolveDependencies,
  importJourneys,
  importJourney,
  getTreeDescendents,
  getNodeRef,
  onlineTreeExportResolver,
  disableJourney: _disableJourney,
  enableJourney: _enableJourney,
  deleteJourney: _deleteJourney,
  deleteJourneys: _deleteJourneys,
} = frodo.authn.journey;
const { findOrphanedNodes, removeOrphanedNodes } = frodo.authn.node;

/**
 * List all the journeys/trees
 * @param {boolean} long Long version, all the fields
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function listJourneys(long: boolean = false): Promise<boolean> {
  let journeys;
  try {
    journeys = await readJourneys();
    if (!long) {
      for (const journeyStub of journeys) {
        printMessage(`${journeyStub['_id']}`, 'data');
      }
      return true;
    } else {
      const spinnerId = createProgressIndicator(
        'indeterminate',
        0,
        `Retrieving details of all journeys...`
      );
      try {
        const journeyExportPromises: {
          journeyId: string;
          promise: Promise<MultiTreeExportInterface>;
        }[] = journeys.map((journeyStub) => ({
          journeyId: journeyStub['_id'],
          promise: exportJourney(journeyStub['_id'], {
            useStringArrays: false,
            deps: false,
            coords: true,
          }),
        }));
        const journeyExports = await Promise.all(
          journeyExportPromises.map((p) => p.promise)
        );
        stopProgressIndicator(
          spinnerId,
          'Retrieved details of all journeys.',
          'success'
        );
        const table = createTable([
          'Name',
          'Status',
          'Inner Only',
          'Must Run',
          'No Session',
          'Tx Only',
          'Resource',
          'Tags',
        ]);
        for (let i = 0; i < journeyExports.length; i++) {
          const { journeyId } = journeyExportPromises[i];
          const treeExport = journeyExports[i].trees[journeyId];
          if (!treeExport) {
            debugMessage(
              `listJourneys: journey '${journeyId}' not found in export response, skipping`
            );
            continue;
          }
          table.push([
            `${treeExport.tree._id}`,
            treeExport.tree.enabled === false
              ? c.negative('disabled')
              : c.positive('enabled'),
            treeExport.tree.innerTreeOnly ? c.warning('yes') : c.positive('no'),
            treeExport.tree.mustRun ? c.warning('yes') : c.positive('no'),
            treeExport.tree.noSession ? c.warning('yes') : c.positive('no'),
            treeExport.tree.transactionalOnly
              ? c.warning('yes')
              : c.positive('no'),
            treeExport.tree.identityResource
              ? treeExport.tree.identityResource
              : '',
            treeExport.tree.uiConfig?.categories
              ? wordwrap(
                  JSON.parse(treeExport.tree.uiConfig.categories).join(', '),
                  60
                )
              : '',
          ]);
        }
        printMessage(table.toString(), 'data');
        return true;
      } catch (error) {
        stopProgressIndicator(
          spinnerId,
          'Error retrieving details of all journeys.',
          'fail'
        );
        printError(error);
      }
    }
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export journey by id/name to file
 * @param {string} journeyId journey id/name
 * @param {string} file optional export file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {TreeExportOptions} options export options
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function exportJourneyToFile(
  journeyId: string,
  file: string,
  includeMeta: boolean = true,
  options: TreeExportOptions = {
    deps: false,
    useStringArrays: false,
    coords: true,
  }
): Promise<boolean> {
  debugMessage(`exportJourneyToFile: start`);
  const verbose = state.getVerbose();
  if (!file) {
    file = getTypedFilename(journeyId, 'journey');
  }
  const filePath = getFilePath(file, true);
  let spinnerId: string;
  if (!verbose)
    spinnerId = createProgressIndicator('indeterminate', 0, `${journeyId}`);
  try {
    const fileData: MultiTreeExportInterface = await exportJourney(
      journeyId,
      options
    );
    delete fileData.meta;
    if (verbose)
      spinnerId = createProgressIndicator('indeterminate', 0, `${journeyId}`);
    saveJsonToFile(fileData, filePath, includeMeta);
    stopProgressIndicator(
      spinnerId,
      `Exported ${c.heading(journeyId)} to ${c.heading(filePath)}.`,
      'success'
    );
    return true;
  } catch (error) {
    if (verbose)
      spinnerId = createProgressIndicator('indeterminate', 0, `${journeyId}`);
    stopProgressIndicator(
      spinnerId,
      `Error exporting journey ${journeyId}: ${error}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export all journeys to file
 * The library reports every journey to the result callback of an {@link OperationRun}: the journeys that can be
 * exported are written to the file, one summary names the ones that could not be, and a failure to read the
 * journeys or to write the file ends the command whatever `--allow-failures` says.
 * @param {string} file optional export file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {TreeExportOptions} options export options
 * @param {boolean} allowFailures true to report journeys that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function exportJourneysToFile(
  file: string,
  includeMeta: boolean = true,
  options: TreeExportOptions = {
    deps: false,
    useStringArrays: false,
    coords: true,
  },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'journey', allowFailures });
  try {
    if (!file) {
      file = getTypedFilename(`all${getRealmString()}Journeys`, 'journey');
    }
    const filePath = getFilePath(file, true);
    const fileData: MultiTreeExportInterface = await exportJourneys(
      options,
      run.resultCallback()
    );
    saveJsonToFile(fileData, filePath, includeMeta);
    return run.finish();
  } catch (error) {
    // not an item failure: the journeys could not be read or the file not written
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Export all journeys to separate files
 * The library reports a journey that cannot be exported to the result callback of an {@link OperationRun}; every
 * journey that can be exported is saved to its own file, a file that cannot be written is a failed journey too, and
 * one summary names them all. A failure to read the journeys ends the command whatever `--allow-failures` says.
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {TreeExportOptions} options export options
 * @param {boolean} allowFailures true to report journeys that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function exportJourneysToFiles(
  includeMeta: boolean = true,
  options: TreeExportOptions = {
    deps: false,
    useStringArrays: false,
    coords: true,
  },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'journey', allowFailures });
  const report = run.resultCallback();
  try {
    // a journey that was exported is counted when its file is saved below, so only the failures are counted here
    const journeysExport = await exportJourneys(options, (error) => {
      if (error) report(error);
    });
    const trees = Object.entries(journeysExport.trees);
    for (const [treeId, treeValue] of trees) {
      const indicatorId = createProgressIndicator(
        'determinate',
        1,
        `Saving ${treeId}...`
      );
      const file = getFilePath(getTypedFilename(`${treeId}`, 'journey'), true);
      const saved = await run.run(treeId, () => {
        updateProgressIndicator(indicatorId, `Saving ${treeId} to ${file}`);
        saveJsonToFile(
          { trees: { [treeValue.tree._id]: treeValue } },
          file,
          includeMeta
        );
      });
      stopProgressIndicator(
        indicatorId,
        saved
          ? `${treeId} saved to ${file}`
          : `Error saving ${treeId} to ${file}`,
        saved ? 'success' : 'fail'
      );
    }
    return run.finish();
  } catch (error) {
    // not an item failure: the journeys could not be read
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Import a journey from file
 * @param {string} journeyId journey id/name
 * @param {string} file import file name
 * @param {TreeImportOptions} options import options
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function importJourneyFromFile(
  journeyId: string,
  file: string,
  options: TreeImportOptions
): Promise<boolean> {
  const verbose = state.getVerbose();
  try {
    const journeysExport = readJourneyExportFromFile(file);
    const journeyData = journeysExport.trees[journeyId];

    // if a journeyId was specified, only import the matching journey
    if (journeyData && journeyId === journeyData.tree._id) {
      // attempt dependency resolution for single tree import
      const installedJourneys = (await readJourneys()).map((x) => x._id);
      const unresolvedJourneys = {};
      const resolvedJourneys = [];
      const indicatorId1 = createProgressIndicator(
        'indeterminate',
        0,
        'Resolving dependencies'
      );
      await resolveDependencies(
        installedJourneys,
        { [journeyId]: journeyData },
        unresolvedJourneys,
        resolvedJourneys
      );
      if (Object.keys(unresolvedJourneys).length === 0) {
        stopProgressIndicator(
          indicatorId1,
          `Resolved all dependencies.`,
          'success'
        );

        let indicatorId2: string;
        if (!verbose)
          indicatorId2 = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${journeyId}...`
          );
        try {
          await importJourney(journeyData, options);
          if (verbose)
            indicatorId2 = createProgressIndicator(
              'indeterminate',
              0,
              `Importing ${journeyId}...`
            );
          stopProgressIndicator(
            indicatorId2,
            `Imported ${journeyId}.`,
            'success'
          );
          return true;
        } catch (importError) {
          if (verbose)
            indicatorId2 = createProgressIndicator(
              'indeterminate',
              0,
              `Importing ${journeyId}...`
            );
          stopProgressIndicator(indicatorId2, `${importError}`, 'fail');
        }
      } else {
        stopProgressIndicator(indicatorId1, `Unresolved dependencies:`, 'fail');
        for (const journey of Object.keys(unresolvedJourneys)) {
          printMessage(
            `  ${journey} requires ${unresolvedJourneys[journey]}`,
            'error'
          );
        }
      }
      // end dependency resolution for single tree import
    } else {
      const indicatorId3 = createProgressIndicator(
        'indeterminate',
        0,
        `Importing ${journeyId}...`
      );
      stopProgressIndicator(indicatorId3, `${journeyId} not found!`, 'fail');
    }
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import first journey from file
 * @param {string} file import file name
 * @param {TreeImportOptions} options import options
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function importFirstJourneyFromFile(
  file: string,
  options: TreeImportOptions
): Promise<boolean> {
  const verbose = state.getVerbose();
  try {
    const journeysExport = readJourneyExportFromFile(file);
    const [journeyId, journeyData] =
      Object.entries(journeysExport.trees)[0] ?? [];

    // if a journeyId was specified, only import the matching journey
    if (journeyData && journeyId) {
      // attempt dependency resolution for single tree import
      const installedJourneys = (await readJourneys()).map((x) => x._id);
      const unresolvedJourneys = {};
      const resolvedJourneys = [];
      const depSpinnerId = createProgressIndicator(
        'indeterminate',
        0,
        'Resolving dependencies'
      );
      await resolveDependencies(
        installedJourneys,
        { [journeyId]: journeyData },
        unresolvedJourneys,
        resolvedJourneys
      );
      if (Object.keys(unresolvedJourneys).length === 0) {
        stopProgressIndicator(
          depSpinnerId,
          `Resolved all dependencies.`,
          'success'
        );

        let importSpinnerId: string;
        if (!verbose)
          importSpinnerId = createProgressIndicator(
            'indeterminate',
            0,
            `Importing ${journeyId}...`
          );
        try {
          await importJourney(journeyData, options);
          if (verbose)
            importSpinnerId = createProgressIndicator(
              'indeterminate',
              0,
              `Importing ${journeyId}...`
            );
          stopProgressIndicator(
            importSpinnerId,
            `Imported ${journeyId}.`,
            'success'
          );
          return true;
        } catch (importError) {
          if (verbose)
            importSpinnerId = createProgressIndicator(
              'indeterminate',
              0,
              `Importing ${journeyId}...`
            );
          stopProgressIndicator(
            importSpinnerId,
            `Error importing ${journeyId}`,
            'fail'
          );
          printError(importError);
        }
      } else {
        stopProgressIndicator(depSpinnerId, `Unresolved dependencies:`, 'fail');
        for (const journey of Object.keys(unresolvedJourneys)) {
          printMessage(
            `  ${journey} requires ${unresolvedJourneys[journey]}`,
            'error'
          );
        }
      }
    } else {
      const importSpinnerId = createProgressIndicator(
        'indeterminate',
        0,
        `Importing...`
      );
      stopProgressIndicator(importSpinnerId, `No journeys found!`, 'fail');
    }
    // end dependency resolution for single tree import
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * What a journey is called in the summary: the library names it only in the
 * message of the error ("Error importing the alpha realm journey Login").
 * @param {FrodoError} error the error the library reported for one journey
 * @returns {string | undefined} the journey name, or undefined if the message has another shape
 */
function journeyNameOf(error: FrodoError): string | undefined {
  return error.message.match(/ journey (.+)$/)?.[1];
}

/**
 * Import all journeys from file
 * The library reports every journey to the result callback of an {@link OperationRun}: the journeys that can be
 * imported are imported, one summary names the ones that could not be. A file that cannot be read, a batch that does
 * not validate or has unresolved dependencies (the library rejects it as a whole) ends the command whatever
 * `--allow-failures` says.
 * @param {string} file import file name
 * @param {TreeImportOptions} options import options
 * @param {boolean} allowFailures true to report journeys that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function importJourneysFromFile(
  file: string,
  options: TreeImportOptions,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'journey', allowFailures });
  try {
    await importJourneys(
      readJourneyExportFromFile(file),
      options,
      run.resultCallback(journeyNameOf)
    );
    return run.finish();
  } catch (error) {
    // not an item failure: the file could not be read or the library rejected the batch
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Import all journeys from separate files
 * A file that cannot be read or parsed is a failed file and the others are still imported. The library reports every
 * journey to the result callback of an {@link OperationRun}; one summary names the files and journeys that failed.
 * A batch that does not validate or has unresolved dependencies (the library rejects it as a whole) ends the command
 * whatever `--allow-failures` says. No journey file at all is not a failure.
 * @param {TreeImportOptions} options import options
 * @param {boolean} allowFailures true to report journeys that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function importJourneysFromFiles(
  options: TreeImportOptions,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'journey', allowFailures });
  try {
    const {
      journeysExport: allJourneysData,
      duplicateJourneyIds,
      unsupportedFiles,
    } = readJourneyExportsFromDirectory((file, error) => {
      printError(error as Error, `Error reading ${file}`);
      run.recordFailure(file, error);
    });
    for (const file of unsupportedFiles) {
      printMessage(`Skipping unsupported journey file format: ${file}`, 'warn');
    }
    for (const duplicate of duplicateJourneyIds) {
      printMessage(
        `Duplicate journey ID "${duplicate.journeyId}" found in ${duplicate.firstFile} and ${duplicate.duplicateFile}.`,
        'warn'
      );
    }
    if (Object.keys(allJourneysData.trees).length === 0) {
      // nothing to import is not a failure (record 0041); a file that could not be read is
      printMessage(
        `No valid journeys found in ${getWorkingDirectory()}. Expected files with either a top-level "trees" object or a top-level "tree" object.`,
        'warn'
      );
      return run.finish();
    }
    await importJourneys(
      allJourneysData,
      options,
      run.resultCallback(journeyNameOf)
    );
    return run.finish();
  } catch (error) {
    // not an item failure: the library rejected the batch
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Get a one-line description of the tree object
 * @param {TreeSkeleton} treeObj circle of trust object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(treeObj: TreeSkeleton): string {
  const description = `[${c.heading(treeObj._id)}]`;
  return description;
}

/**
 * Get a one-line description of the tree object in markdown
 * @param {TreeSkeleton} treeObj circle of trust object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescriptionMd(treeObj: TreeSkeleton): string {
  const description = `${treeObj._id}`;
  return description;
}

/**
 * Helper function to render a nested list of dependent trees
 * @param {TreeDependencyMapInterface} descendents tree dependency map
 * @param {number} depth level of nesting
 */
function describeTreeDescendents(
  descendents: TreeDependencyMapInterface,
  depth = 0
) {
  if (depth || Object.values(descendents)[0].length) {
    // heading
    if (depth === 0) {
      printMessage(
        `\nInner Tree Dependencies (${Object.values(descendents)[0].length}):`,
        'data'
      );
    }
    const indent = Array(depth * 2)
      .fill(' ')
      .join('');
    const [tree] = Object.keys(descendents);
    printMessage(`${indent}- ${c.heading(tree)}`, 'data');
    for (const descendent of descendents[tree]) {
      describeTreeDescendents(descendent, depth + 1);
    }
  }
}

/**
 * Helper function to render a nested list of dependent trees in markdown
 * @param {TreeDependencyMapInterface} descendents tree dependency map
 * @param {number} depth level of nesting
 */
function describeTreeDescendentsMd(
  descendents: TreeDependencyMapInterface,
  depth = 0
): string {
  let markdown = '';
  if (depth || Object.values(descendents)[0].length) {
    // heading
    if (depth === 0) {
      markdown += `## Inner Tree Dependencies (${
        Object.values(descendents)[0].length
      })\n`;
    }
    const indent = Array(depth * 2)
      .fill(' ')
      .join('');
    const [tree] = Object.keys(descendents);
    markdown += `${indent}- ${tree}\n`;
    for (const descendent of descendents[tree]) {
      markdown += describeTreeDescendentsMd(descendent, depth + 1);
    }
    return markdown;
  }
  return markdown;
}

/**
 * Return an object map's values sorted by key. Export maps like
 * `journeyData.scripts` are assembled by walking a tree's nodes and
 * deduplicating by id as references are discovered, so their key order
 * reflects incidental discovery order rather than anything stable -- AM
 * itself doesn't guarantee a tree's own node/reference order is identical
 * across separate requests either. Describing the same journey twice
 * (e.g. a live run vs. a later replay of recorded traffic) can otherwise
 * print the same set of entries in a different order.
 * @param {Record<string, T>} obj object map to sort
 * @returns {T[]} values sorted by their key
 */
function sortedValues<T>(obj: Record<string, T>): T[] {
  return Object.keys(obj)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => obj[key]);
}

/**
 * Describe a journey:
 * - Properties, tags, description, name, metadata
 * - Inner tree dependency tree
 * - Node type summary
 * - Nodes
 * - Themes
 * - Scripts
 * - Email templates
 * - Social identity providers
 * - SAML2 entity providers
 * - SAML2 circles of trust
 * @param {SingleTreeExportInterface} journeyData journey export object
 * @param {TreeExportResolverInterface} resolveTreeExport tree export resolver callback function
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function describeJourney(
  journeyData: SingleTreeExportInterface,
  resolveTreeExport: TreeExportResolverInterface = onlineTreeExportResolver
): Promise<boolean> {
  const errors: Error[] = [];
  try {
    const allNodes = {
      ...journeyData.nodes,
      ...journeyData.innerNodes,
    };
    const nodeTypeMap = {};

    for (const nodeData of Object.values(allNodes)) {
      if (nodeTypeMap[nodeData._type._id]) {
        nodeTypeMap[nodeData._type._id] += 1;
      } else {
        nodeTypeMap[nodeData._type._id] = 1;
      }
    }

    // initialize AM version from file
    if (!state.getAmVersion() && journeyData.meta?.originAmVersion) {
      state.setAmVersion(journeyData.meta.originAmVersion);
    }

    // Journey Name
    printMessage(`${getOneLineDescription(journeyData.tree)}`, 'data');
    printMessage(
      Array(`[${journeyData.tree._id}]`['length']).fill('=').join('')
    );

    // Description
    if (journeyData.tree.description) {
      printMessage(`\n${journeyData.tree.description}`, 'data');
    }

    // Status
    printMessage(
      `\nStatus\n${
        journeyData.tree.enabled === false
          ? c.negative('disabled')
          : c.positive('enabled')
      }`
    );

    // Journey flags
    printMessage(
      `\nFlags\n- Inner Tree Only: ${
        journeyData.tree.innerTreeOnly ? c.warning('true') : c.positive('false')
      }\n- Must Run: ${
        journeyData.tree.mustRun ? c.warning('true') : c.positive('false')
      }\n- No Session: ${
        journeyData.tree.noSession ? c.warning('true') : c.positive('false')
      }\n- Transactional Only: ${
        journeyData.tree.transactionalOnly
          ? c.warning('true')
          : c.positive('false')
      }`
    );

    // Categories/Tags
    if (
      journeyData.tree.uiConfig?.categories &&
      journeyData.tree.uiConfig.categories != '[]'
    ) {
      printMessage('\nCategories/Tags', 'data');
      printMessage(
        `${JSON.parse(journeyData.tree.uiConfig.categories).join(', ')}`,
        'data'
      );
    }

    // Dependency Tree
    try {
      const descendents = await getTreeDescendents(
        journeyData,
        resolveTreeExport
      );
      describeTreeDescendents(descendents);
    } catch (error) {
      errors.push(error);
    }

    // Node Types
    if (Object.entries(nodeTypeMap).length) {
      printMessage(
        `\nNode Types (${Object.entries(nodeTypeMap).length}):`,
        'data'
      );
      for (const [nodeType, count] of Object.entries(nodeTypeMap)) {
        printMessage(`- ${String(count)} [${c.heading(nodeType)}]`, 'data');
      }
    }

    // Nodes
    if (Object.entries(allNodes).length) {
      printMessage(`\nNodes (${Object.entries(allNodes).length}):`, 'data');
      for (const nodeObj of sortedValues<NodeSkeleton>(allNodes)) {
        printMessage(
          `- ${Node.getOneLineDescription(
            nodeObj,
            getNodeRef(nodeObj, journeyData)
          )}`,
          'data'
        );
      }
    }

    // Themes
    if (journeyData.themes?.length) {
      printMessage(`\nThemes (${journeyData.themes.length}):`, 'data');
      for (const themeData of journeyData.themes) {
        printMessage(`- ${Theme.getOneLineDescription(themeData)}`, 'data');
      }
    }

    // Scripts
    if (Object.entries(journeyData.scripts).length) {
      printMessage(
        `\nScripts (${Object.entries(journeyData.scripts).length}):`,
        'data'
      );
      for (const scriptData of sortedValues(journeyData.scripts)) {
        printMessage(`- ${Script.getOneLineDescription(scriptData)}`, 'data');
      }
    }

    // Email Templates
    if (Object.entries(journeyData.emailTemplates).length) {
      printMessage(
        `\nEmail Templates (${
          Object.entries(journeyData.emailTemplates).length
        }):`,
        'data'
      );
      for (const templateData of sortedValues(journeyData.emailTemplates)) {
        printMessage(
          `- ${EmailTemplate.getOneLineDescription(templateData)}`,
          'data'
        );
      }
    }

    // Social Identity Providers
    if (Object.entries(journeyData.socialIdentityProviders).length) {
      printMessage(
        `\nSocial Identity Providers (${
          Object.entries(journeyData.socialIdentityProviders).length
        }):`,
        'data'
      );
      for (const socialIdpData of sortedValues(
        journeyData.socialIdentityProviders
      )) {
        printMessage(`- ${Idp.getOneLineDescription(socialIdpData)}`, 'data');
      }
    }

    // SAML2 Entity Providers
    if (Object.entries(journeyData.saml2Entities).length) {
      printMessage(
        `\nSAML2 Entity Providers (${
          Object.entries(journeyData.saml2Entities).length
        }):`,
        'data'
      );
      for (const entityProviderData of sortedValues(
        journeyData.saml2Entities
      )) {
        printMessage(
          `- ${Saml2.getOneLineDescription(entityProviderData)}`,
          'data'
        );
      }
    }

    // SAML2 Circles Of Trust
    if (Object.entries(journeyData.circlesOfTrust).length) {
      printMessage(
        `\nSAML2 Circles Of Trust (${
          Object.entries(journeyData.circlesOfTrust).length
        }):`,
        'data'
      );
      for (const cotData of sortedValues(journeyData.circlesOfTrust)) {
        printMessage(
          `- ${CirclesOfTrust.getOneLineDescription(cotData)}`,
          'data'
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error describing journey`, errors);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Describe a journey in markdown:
 * - Properties, tags, description, name, metadata
 * - Inner tree dependency tree
 * - Node type summary
 * - Nodes
 * - Themes
 * - Scripts
 * - Email templates
 * - Social identity providers
 * - SAML2 entity providers
 * - SAML2 circles of trust
 * @param {SingleTreeExportInterface} journeyData journey export object
 * @param {TreeExportResolverInterface} resolveTreeExport tree export resolver callback function
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function describeJourneyMd(
  journeyData: SingleTreeExportInterface,
  resolveTreeExport: TreeExportResolverInterface = onlineTreeExportResolver
) {
  const errors: Error[] = [];
  try {
    const allNodes = {
      ...journeyData.nodes,
      ...journeyData.innerNodes,
    };
    const nodeTypeMap = {};

    for (const nodeData of Object.values(allNodes)) {
      if (nodeTypeMap[nodeData._type._id]) {
        nodeTypeMap[nodeData._type._id] += 1;
      } else {
        nodeTypeMap[nodeData._type._id] = 1;
      }
    }

    // initialize AM version from file
    if (!state.getAmVersion() && journeyData.meta?.originAmVersion) {
      state.setAmVersion(journeyData.meta.originAmVersion);
    }

    // Journey Name
    printMessage(
      `# ${getOneLineDescriptionMd(journeyData.tree)} - ${
        journeyData.tree.enabled === false
          ? ':o: `disabled`'
          : ':white_check_mark: `enabled`'
      }, ${
        journeyData.tree.innerTreeOnly
          ? ':o: `innerTreeOnly`'
          : ':white_check_mark: `not innerTreeOnly`'
      }, ${
        journeyData.tree.mustRun
          ? ':o: `mustRun`'
          : ':white_check_mark: `not mustRun`'
      }, ${
        journeyData.tree.noSession
          ? ':o: `noSession`'
          : ':white_check_mark: `sessionAllowed`'
      }, ${
        journeyData.tree.transactionalOnly
          ? ':o: `transactionalOnly`'
          : ':white_check_mark: `not transactionalOnly`'
      }${
        journeyData.tree.identityResource
          ? `, identity resource: \`${journeyData.tree.identityResource}\``
          : ''
      }`,
      'data'
    );

    // Categories/Tags
    if (
      journeyData.tree.uiConfig?.categories &&
      journeyData.tree.uiConfig.categories != '[]'
    ) {
      printMessage(
        `\`${JSON.parse(journeyData.tree.uiConfig.categories).join('`, `')}\``,
        'data'
      );
    }

    // Description
    if (journeyData.tree.description) {
      printMessage(`\n${journeyData.tree.description}`, 'data');
    }

    // Journey image
    printMessage(`\n[![](./${journeyData.tree._id}.png)]()\n`, 'data');

    // Dependency Tree
    const descendents = await getTreeDescendents(
      journeyData,
      resolveTreeExport
    );
    printMessage(describeTreeDescendentsMd(descendents), 'data');

    // Node Types
    if (Object.entries(nodeTypeMap).length) {
      printMessage(
        `## Node Types (${Object.entries(nodeTypeMap).length})`,
        'data'
      );
      printMessage('| Count | Type |', 'data');
      printMessage('| -----:| ---- |', 'data');
      for (const [nodeType, count] of Object.entries(nodeTypeMap)) {
        printMessage(`| ${String(count)} | ${nodeType} |`, 'data');
      }
    }

    // Nodes
    if (Object.entries(allNodes).length) {
      printMessage(`## Nodes (${Object.entries(allNodes).length})`, 'data');
      printMessage(Node.getTableHeaderMd(), 'data');
      for (const nodeObj of sortedValues<NodeSkeleton>(allNodes)) {
        printMessage(
          `${Node.getTableRowMd(nodeObj, getNodeRef(nodeObj, journeyData))}`,
          'data'
        );
      }
    }

    // Themes
    if (journeyData.themes?.length) {
      printMessage(`## Themes (${journeyData.themes.length})`, 'data');
      printMessage(Theme.getTableHeaderMd(), 'data');
      for (const themeData of journeyData.themes) {
        printMessage(`${Theme.getTableRowMd(themeData)}`, 'data');
      }
    }

    // Scripts
    if (Object.entries(journeyData.scripts).length) {
      printMessage(
        `## Scripts (${Object.entries(journeyData.scripts).length})`,
        'data'
      );
      printMessage(Script.getTableHeaderMd(), 'data');
      for (const scriptData of sortedValues(journeyData.scripts)) {
        printMessage(`${Script.getTableRowMd(scriptData)}`, 'data');
      }
    }

    // Email Templates
    if (Object.entries(journeyData.emailTemplates).length) {
      printMessage(
        `## Email Templates (${
          Object.entries(journeyData.emailTemplates).length
        })`,
        'data'
      );
      printMessage(EmailTemplate.getTableHeaderMd(), 'data');
      for (const templateData of sortedValues(journeyData.emailTemplates)) {
        printMessage(`${EmailTemplate.getTableRowMd(templateData)}`, 'data');
      }
    }

    // Social Identity Providers
    if (Object.entries(journeyData.socialIdentityProviders).length) {
      printMessage(
        `## Social Identity Providers (${
          Object.entries(journeyData.socialIdentityProviders).length
        })`,
        'data'
      );
      printMessage(Idp.getTableHeaderMd(), 'data');
      for (const socialIdpData of sortedValues(
        journeyData.socialIdentityProviders
      )) {
        printMessage(`${Idp.getTableRowMd(socialIdpData)}`, 'data');
      }
    }

    // SAML2 Entity Providers
    if (Object.entries(journeyData.saml2Entities).length) {
      printMessage(
        `## SAML2 Entity Providers (${
          Object.entries(journeyData.saml2Entities).length
        })`,
        'data'
      );
      printMessage(Saml2.getTableHeaderMd(), 'data');
      for (const entityProviderData of sortedValues(
        journeyData.saml2Entities
      )) {
        printMessage(`${Saml2.getTableRowMd(entityProviderData)}`, 'data');
      }
    }

    // SAML2 Circles Of Trust
    if (Object.entries(journeyData.circlesOfTrust).length) {
      printMessage(
        `## SAML2 Circles Of Trust (${
          Object.entries(journeyData.circlesOfTrust).length
        })`,
        'data'
      );
      printMessage(CirclesOfTrust.getTableHeaderMd(), 'data');
      for (const cotData of sortedValues(journeyData.circlesOfTrust)) {
        printMessage(`${CirclesOfTrust.getTableRowMd(cotData)}`, 'data');
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error describing journey`, errors);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/** What the description of a journey of the tenant is made with. */
export interface DescribeJourneysOptions {
  /** describe this journey; undefined: describe every journey of the realm */
  journeyId?: string;
  /** write markdown instead of text */
  markdown?: boolean;
  /** the file the output goes to, which the markdown output resets first */
  outputFile?: string;
  /** describe as if the tenant ran this version: '<major>.<minor>.<patch>' */
  overrideVersion?: string;
}

/**
 * Describe one journey of the tenant. Throws when the journey cannot be exported.
 * @param {string} journeyId journey id/name
 * @param {DescribeJourneysOptions} options markdown, output file, version override
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
async function describeJourneyOfTenant(
  journeyId: string,
  options: DescribeJourneysOptions
): Promise<boolean> {
  // Keep live export pinned to the detected/runtime AM version so endpoint selection remains valid.
  const multiTreeData = await exportJourney(journeyId);
  const treeData = multiTreeData.trees[journeyId];
  if (!treeData) {
    throw new Error(`Journey '${journeyId}' not found in export response`);
  }
  const originalAmVersion = state.getAmVersion();
  const runtimeResolver = async (treeId) => {
    // Dependency resolution can trigger additional online exports; force those to use runtime AM version.
    const resolverVersion = state.getAmVersion();
    state.setAmVersion(originalAmVersion);
    try {
      return await onlineTreeExportResolver(treeId, state);
    } finally {
      state.setAmVersion(resolverVersion);
    }
  };
  try {
    // Override is for compatibility rendering only, not for live fetch/export transport behavior.
    if (typeof options.overrideVersion !== 'undefined') {
      state.setAmVersion(options.overrideVersion);
    }
    // ANSI text output
    if (!options.markdown) {
      return await describeJourney(treeData, runtimeResolver);
    }
    // Markdown output: reset output file
    if (options.outputFile) saveTextToFile('', options.outputFile);
    return await describeJourneyMd(treeData, runtimeResolver);
  } finally {
    // Always restore the original runtime version for subsequent operations.
    state.setAmVersion(originalAmVersion);
  }
}

/**
 * Describe the journey indicated by the journey id, or every journey of the realm if there is none.
 * Every journey of the realm is one operation of an {@link OperationRun}: a journey that cannot be described does not
 * stop the others from being described, and one summary names the ones that failed. A failure to read the journeys
 * ends the command whatever `--allow-failures` says.
 * @param {DescribeJourneysOptions} options journey id, markdown, output file, version override
 * @param {boolean} allowFailures true to report journeys that could not be described but still succeed. Default: false
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function describeJourneys(
  options: DescribeJourneysOptions,
  allowFailures: boolean = false
): Promise<boolean> {
  if (typeof options.journeyId !== 'undefined') {
    try {
      return await describeJourneyOfTenant(options.journeyId, options);
    } catch (error) {
      printError(error);
    }
    return false;
  }
  let journeys;
  try {
    journeys = await readJourneys();
  } catch (error) {
    printError(error);
    return false;
  }
  const run = new OperationRun({ unit: 'journey', allowFailures });
  for (const journey of journeys) {
    await run.run(journey['_id'], () =>
      describeJourneyOfTenant(journey['_id'], options)
    );
  }
  return run.finish();
}

/**
 * Find the orphaned nodes of the realm and delete them, each node being one operation of the run. A node that cannot
 * be deleted does not stop the others. When the orphaned nodes cannot even be found, the error is printed and the
 * answer is false: there is no node to count.
 * @param {OperationRun} run the run that records what happens to the nodes
 * @param {() => Promise<boolean>} ask the question to ask before anything is deleted, answering true for yes, or undefined to delete without asking
 * @param {boolean} quietWhenNone true to say "No orphaned nodes found." only in verbose mode. Default: false
 * @returns {Promise<boolean>} a promise resolving to false if the orphaned nodes could not be found or deleted at all, true otherwise
 */
export async function pruneOrphanedNodesInRun(
  run: OperationRun,
  ask?: () => Promise<boolean>,
  quietWhenNone: boolean = false
): Promise<boolean> {
  try {
    const orphanedNodes = await findOrphanedNodes();
    if (orphanedNodes.length === 0) {
      if (quietWhenNone) verboseMessage('No orphaned nodes found.');
      else printMessage('No orphaned nodes found.');
      return true;
    }
    if (ask && !(await ask())) return true;
    // the library prints the error of every node it cannot delete and returns those nodes
    const failedNodes = await removeOrphanedNodes(orphanedNodes);
    const failedIds = new Set(failedNodes.map((node) => node._id));
    const nodeIds = new Set(orphanedNodes.map((node) => node._id));
    for (const nodeId of nodeIds) {
      if (failedIds.has(nodeId)) {
        const node = orphanedNodes.find((n) => n._id === nodeId);
        run.recordFailure(`orphaned node ${nodeId} (${node?._type?._id})`);
      } else {
        run.recordSuccess();
      }
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Prune orphaned configuration artifacts left behind after deleting authentication trees, after asking for confirmation.
 * Every orphaned node is one operation of an {@link OperationRun}: a node that cannot be deleted does not stop the
 * others, and one summary names the ones that failed. Orphaned nodes that cannot be found fail the command whatever
 * `--allow-failures` says.
 * @param {() => Promise<boolean>} ask the question to ask before anything is deleted, answering true for yes
 * @param {boolean} allowFailures true to report nodes that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function pruneOrphanedNodes(
  ask: () => Promise<boolean>,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'node', allowFailures });
  const found = await pruneOrphanedNodesInRun(run, ask);
  return run.finish() && found;
}

/**
 * Enable a journey
 * @param {string} journeyId id/name of journey
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function enableJourney(journeyId: string): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Enabling journey ${journeyId}...`
  );
  try {
    await _enableJourney(journeyId);
    stopProgressIndicator(
      indicatorId,
      `Enabled journey ${journeyId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error enabling journey ${journeyId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Disable a journey
 * @param {string} journeyId id/name of journey
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function disableJourney(journeyId: string): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Disabling journey ${journeyId}...`
  );
  try {
    await _disableJourney(journeyId);
    stopProgressIndicator(
      indicatorId,
      `Disabled journey ${journeyId}.`,
      'success'
    );
    return true;
  } catch {
    stopProgressIndicator(
      indicatorId,
      `Error disabling journey ${journeyId}`,
      'fail'
    );
  }
  return false;
}

/**
 * Why a journey was not deleted as asked, from the status the library returns:
 * it does not throw for a journey that could not be deleted, it returns
 * `{ status: 'error', error }`, and with a deep delete the nodes it could not
 * delete are listed in `nodes`.
 * @param {unknown} journeyStatus the status of one journey from the library
 * @returns {{ reason: string; error?: Error } | undefined} why not, with the error when there is one, or undefined if the journey was deleted
 */
function whyNotDeleted(
  journeyStatus: unknown
): { reason: string; error?: Error } | undefined {
  const { status, error, nodes } = (journeyStatus ?? {}) as {
    status?: string;
    error?: Error;
    nodes?: Record<string, { status?: string; error?: unknown }>;
  };
  if (status === 'error') return { reason: causeOf(error), error };
  const failedNodes = Object.values(nodes ?? {}).filter(
    (node) => node?.status === 'error'
  );
  if (failedNodes.length > 0) {
    return {
      reason: `the journey is deleted, but ${failedNodes.length} of ${
        Object.keys(nodes).length
      } nodes could not be deleted: ${causeOf(failedNodes[0].error)}`,
    };
  }
  return undefined;
}

/**
 * Print why a journey was not deleted
 * @param {string} journeyId id/name of journey
 * @param {{ reason: string; error?: Error }} why what whyNotDeleted answered
 */
function printNotDeleted(
  journeyId: string,
  why: { reason: string; error?: Error }
): void {
  if (why.error) {
    printError(why.error, `Error deleting journey ${journeyId}`);
  } else {
    printMessage(`Error deleting journey ${journeyId}: ${why.reason}`, 'error');
  }
}

/**
 * Delete a journey
 * @param {string} journeyId id/name of journey
 * @param {{ deep: boolean; verbose: boolean }} [options] delete journey options
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function deleteJourney(
  journeyId: string,
  options: { deep: boolean; verbose: boolean; progress?: boolean } = {
    deep: true,
    verbose: false,
    progress: true,
  }
): Promise<boolean> {
  try {
    const why = whyNotDeleted(await _deleteJourney(journeyId, options));
    if (!why) return true;
    printNotDeleted(journeyId, why);
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete all journeys
 * @param {{ deep: boolean; verbose: boolean }} [options] delete journey options
 * @param {boolean} allowFailures true to report journeys that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function deleteJourneys(
  options: { deep: boolean; verbose: boolean } = {
    deep: true,
    verbose: false,
  },
  allowFailures = false
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    null,
    `Deleting journeys...`
  );
  try {
    const run = new OperationRun({ unit: 'journey', allowFailures });
    // The library puts the result of every journey in the returned status and
    // does not throw for one that could not be deleted. It only calls the
    // callback with an error for a journey that failed in some other way, and
    // that journey is not in the status. A failed read of the journeys throws.
    const status: DeleteJourneysStatus = await _deleteJourneys(
      options,
      (error?: Error) => {
        if (!error) return;
        printError(error);
        const described = describeFailure(error);
        run.recordFailure(described.name, described.reason);
      }
    );
    for (const [journeyId, journeyStatus] of Object.entries(status)) {
      const why = whyNotDeleted(journeyStatus);
      if (!why) {
        run.recordSuccess();
      } else {
        printNotDeleted(journeyId, why);
        run.recordFailure(journeyId, why.reason);
      }
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? `Some journeys could not be deleted.`
        : `Deleted ${Object.keys(status).length} journeys`,
      run.hasFailures ? 'fail' : 'success'
    );
    return run.finish();
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error deleting journeys`);
    printError(error);
  }
  return false;
}
