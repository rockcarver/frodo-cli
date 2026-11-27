import path from 'node:path';
import fs from 'fs';
import {
  frodo,
  state,
  type FrodoError,
  type JourneyReference,
  type NodeSkeleton,
  type ScriptSkeleton,
  type SingleTreeExportInterface,
  type TreeSkeleton,
} from '@rockcarver/frodo-lib';
import {
  printJourneyFindingsHint,
  wantsJourneyFindingsHint,
} from '../ops/JourneyFindingsHint';
import { extractFrConfigDataToFile } from '../utils/Config';
import {
  encodedName,
  nameInFolder,
  objectFilePath,
  objectFolderPath,
  pulledFilePath,
  PulledPaths,
  realmFolderOf,
  referencedFilePath,
} from '../utils/ConfigTreePath';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { existScript, realmList, safeFileName } from '../utils/FrConfig';
import {
  missingNodesMessage,
  missingNodesName,
  missingNodesOf,
  missingNodesReason,
} from '../utils/JourneyExportErrors';
import { OperationRun } from '../utils/OperationRun';
import {
  clearJourneyReference,
  describeReference,
  planJourneyDelete,
  referenceLine,
  unlinkJourneyReference,
  type JourneyDeletePlan,
} from './JourneyReferenceClearing';
import { unreadableSources, type ClearingError } from './ReferenceDelete';

const { saveJsonToFile, getFilePath, readJsonFile } = frodo.utils;
const { exportScript } = frodo.script;
const {
  exportJourneys,
  importJourneys,
  createSingleTreeExportTemplate,
  readJourneys,
  deleteJourney,
  deleteJourneys,
} = frodo.authn.journey;
const { DEFAULT_REALM_KEY, CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

/**
 * Export journeys in fr-config-manager format
 * Every journey is exported even when another one failed, and one summary names the failed ones. A failure to list
 * the realms or the journeys of a realm ends the command whatever `allowFailures` says.
 * @param {string} name exports only the specifically named journey
 * @param {string} realm exports journeys only in specified realm
 * @param {boolean} pullDependencies true (the default) to export the scripts that the journeys use and, when a journey is named, its inner journeys, false to export the journeys alone
 * @param {boolean} clean if true clear existing configuration, otherwise false
 * @param {boolean} allowFailures true to succeed although some journeys could not be exported (the failures are still summarised)
 * @returns {Promise<boolean>} A promise that resolves to false if a journey cannot be exported (unless failures are allowed) or the named journey does not exist, true otherwise
 */
export async function configManagerExportJourneys(
  name?: string,
  realm?: string,
  pullDependencies: boolean = true,
  clean: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'journey', allowFailures });
  try {
    const realmNames =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    let found = false;
    let hintAtFindings = false;
    const pulledPaths = new PulledPaths();
    for (const realmName of realmNames) {
      if (
        realmName === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      // the tenant names the realm: it is the name of a folder here, never a path
      const realmDir = run.deriveOrFail(
        `realm ${realmName}`,
        () => realmFolderOf(realmName),
        'Its journeys are not pulled.'
      );
      if (realmDir === undefined) continue;
      state.setRealm(realmName);
      // a journey that was read is counted when its files are written, so only the failures are counted here
      const report = run.resultCallback();
      const exportData = await exportJourneys(
        {
          deps: false,
          useStringArrays: false,
          coords: true,
        },
        (error) => {
          if (!error) return;
          // a journey whose nodes are not on the tenant is one line, unless the output is verbose
          const missing = state.getVerbose()
            ? undefined
            : missingNodesOf(error);
          if (!missing) {
            report(error);
            return;
          }
          printMessage(missingNodesMessage(missing), 'error');
          run.recordFailure(
            missingNodesName(missing),
            missingNodesReason(missing)
          );
        }
      );
      if (name && exportData.trees[name]) found = true;
      hintAtFindings ||= await wantsJourneyFindingsHint(exportData);
      await processJourneysExport(
        exportData.trees,
        realmDir,
        name,
        pullDependencies,
        clean,
        run,
        undefined,
        pulledPaths
      );
    }
    if (hintAtFindings) printJourneyFindingsHint();
    const succeeded = run.finish();
    // a journey that failed to be read has been reported already
    if (name && !found && !run.hasFailures) {
      printMessage(`Journey '${name}' not found.`, 'error');
      return false;
    }
    return succeeded;
  } catch (error) {
    // not an item failure: the realms or the journeys could not be listed
    printError(error, `Error exporting journeys`);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Helper that processes a journey node for export
 * @param {NodeSkeleton} node the journey node
 * @param {string} displayName the node display name
 * @param {string} nodeDir the node directory
 * @param {string} realmDir the realm directory
 * @param {boolean} pullDependencies include the script of the node
 * @param {SingleTreeExportInterface} journey the journey export
 * @param {PulledPaths} pulledPaths the files of this pull, to refuse a file that another one replaces on a file system that ignores case
 */
async function processNodeExport(
  node: NodeSkeleton,
  displayName: string,
  nodeDir: string,
  realmDir: string,
  pullDependencies: boolean,
  journey: SingleTreeExportInterface,
  pulledPaths: PulledPaths
) {
  const nodeFileDir = `${nodeDir}/${safeFileName(`${displayName} - ${node._id}`)}`;
  if (node._type?._id === 'PageNode') {
    for (const innerNode of node.nodes) {
      await processNodeExport(
        journey.innerNodes[innerNode._id],
        innerNode.displayName,
        nodeFileDir,
        realmDir,
        pullDependencies,
        journey,
        pulledPaths
      );
    }
  }
  if (
    pullDependencies &&
    journeyNodeNeedsScript(node) &&
    !existScript(node.script, realmDir)
  ) {
    const script = (
      await exportScript(node.script, {
        deps: false,
        includeDefault: true,
        useStringArrays: false,
      })
    ).script[node.script];
    const scriptsDir = `realms/${realmDir}/scripts/`;
    // the tenant names the script: its name, context and id are file names here, never paths
    pulledPaths.owner = script._id;
    script.script = extractFrConfigDataToFile(
      script.script,
      `scripts-content/${nameInFolder(String(script.context))}/${encodedName(String(script.name), '.js')}.js`,
      scriptsDir,
      pulledPaths
    ) as any;
    saveJsonToFile(
      script,
      getFilePath(
        pulledFilePath(
          `${scriptsDir}scripts-config/${nameInFolder(script._id)}.json`,
          pulledPaths
        ),
        true
      ),
      false,
      true,
      true
    );
  }
  pulledPaths.owner = node._id;
  saveJsonToFile(
    node,
    getFilePath(pulledFilePath(`${nodeFileDir}.json`, pulledPaths), true),
    false,
    true,
    true
  );
}

/**
 * Helper that processes journeys for export
 * @param {Record<string, SingleTreeExportInterface>} journeys The journeys to process
 * @param {string} realmDir the folder of the realm of the journeys, from `realmFolderOf`
 * @param {string} name processes only the specifically named journey
 * @param {boolean} pullDependencies include the scripts of the journeys and, when a journey is named, its inner journeys
 * @param {boolean} clean if true clear existing configuration, otherwise false
 * @param {OperationRun} run Optional. Runs the export of each journey as an operation of this run, so that a journey that cannot be written does not stop the others. Without it the first error is thrown.
 * @param {Set<string>} exported Optional. The journeys that were exported already, so that journeys that use each other are exported once and the recursion ends.
 * @param {PulledPaths} pulledPaths Optional. The files of this pull, to refuse a file that another one replaces on a file system that ignores case
 */
async function processJourneysExport(
  journeys: Record<string, SingleTreeExportInterface>,
  realmDir: string,
  name?: string,
  pullDependencies: boolean = true,
  clean: boolean = false,
  run?: OperationRun,
  exported: Set<string> = new Set(),
  pulledPaths = new PulledPaths()
): Promise<void> {
  const journeysDir = `realms/${realmDir}/journeys`;
  for (const [treeId, journey] of Object.entries(journeys)) {
    if (name && treeId !== name) {
      continue;
    }
    if (exported.has(treeId)) {
      continue;
    }
    exported.add(treeId);
    const exportJourney = async () => {
      // the tenant names the journey: its id is the name of its folder and of its file, never a path
      const journeyDir = objectFolderPath(journeysDir, treeId);
      const nodeDir = `${journeyDir}/nodes`;
      // the file of the journey is claimed first: a second journey that has the same file name fails before it writes a node
      pulledPaths.owner = treeId;
      pulledFilePath(objectFilePath(journeyDir, treeId), pulledPaths);
      if (clean) {
        fs.rmSync(getFilePath(pulledFilePath(nodeDir, pulledPaths)), {
          recursive: true,
          force: true,
        });
      }
      for (const node of Object.values(journey.nodes)) {
        if (
          name &&
          pullDependencies &&
          node._type._id === 'InnerTreeEvaluatorNode'
        ) {
          await processJourneysExport(
            journeys,
            realmDir,
            node.tree,
            pullDependencies,
            clean,
            undefined,
            exported,
            pulledPaths
          );
        }
        await processNodeExport(
          node,
          journey.tree.nodes[node._id].displayName,
          nodeDir,
          realmDir,
          pullDependencies,
          journey,
          pulledPaths
        );
      }
      // the file of the journey has the name of its folder, which is the name a push reads
      pulledPaths.owner = treeId;
      saveJsonToFile(
        journey.tree,
        getFilePath(
          pulledFilePath(objectFilePath(journeyDir, treeId), pulledPaths),
          true
        ),
        false,
        true,
        true
      );
    };
    if (run) await run.run(`${realmDir}/${printable(treeId)}`, exportJourney);
    else await exportJourney();
  }
}

/** The value of `script` of a node that has no script: there is nothing to export and nothing to push. */
const EMPTY_SCRIPT = '[Empty]';

function journeyNodeNeedsScript(node) {
  return (
    // eslint-disable-next-line no-prototype-builtins
    node.hasOwnProperty('script') &&
    node.script !== EMPTY_SCRIPT &&
    // eslint-disable-next-line no-prototype-builtins
    (!node.hasOwnProperty('useScript') || node.useScript)
  );
}

/**
 * A file that a journey needs is not in the config folder. The journey cannot be pushed, and neither can a journey that
 * needs it: `journeys` names them, the one that needs the file first.
 */
class MissingDependencyError extends Error {
  readonly journeys: string[];

  constructor(journey: string, message: string) {
    super(message);
    this.journeys = [journey];
  }
}

/**
 * A name from a file of the config folder as a message shows it: a control character is written as
 * `\u0001`, so that it cannot change what the terminal shows.
 * @param {string} name the name
 * @returns {string} the name without control characters
 */
function printable(name: string): string {
  return String(name).replace(
    /\p{Cc}/gu,
    (character) =>
      `\\u${(character.codePointAt(0) as number).toString(16).padStart(4, '0')}`
  );
}

/**
 * A path of the config folder as the user knows it: below `realms`, with forward slashes, without the folder that the
 * directory option names.
 * @param {string} file a path inside the `realms` folder
 * @returns {string} the path, for example `realms/alpha/journeys/Login/Login.json`
 */
function shownPath(file: string): string {
  const relative = path.relative(getFilePath('realms'), file);
  return `realms/${relative.split(path.sep).join('/')}`;
}

/**
 * The error of a journey that needs a file that is not there.
 * @param {string} journey the journey that needs it
 * @param {string} needed what the journey needs, for example `the script 'S'`
 * @param {string} problem what is missing, for example `its file is missing`
 * @param {string} file the file that was looked for
 * @param {boolean} dependencies true if the dependencies are pushed, which can be turned off
 * @returns {MissingDependencyError} the error to throw
 */
function missingDependency(
  journey: string,
  needed: string,
  problem: string,
  file: string,
  dependencies: boolean
): MissingDependencyError {
  const hint = dependencies
    ? 'Pull the dependency too, or push with --no-deps.'
    : 'Pull the dependency too, or push the journey with -i.';
  return new MissingDependencyError(
    journey,
    `Journey '${printable(journey)}' requires ${printable(needed)}, but ${problem}: ${shownPath(file)}\n${hint}`
  );
}

/**
 * Read a node's script from the fr-config-manager scripts directory, inlining its content into the scripts map
 * @param {NodeSkeleton} node journey node that may reference a script
 * @param {boolean} pushScripts whether script export is enabled
 * @param {Record<string, ScriptSkeleton>} scripts map of script id to script object, populated by this function
 * @param {string} realmDir on-disk realm directory name
 * @param {string} journeyName the journey that has the node
 * @throws {MissingDependencyError} if the file of the script, or its content file, is not there
 */
function readNodeScript(
  node: NodeSkeleton,
  pushScripts: boolean,
  scripts: Record<string, ScriptSkeleton>,
  realmDir: string,
  journeyName: string
): void {
  if (!pushScripts || !journeyNodeNeedsScript(node) || scripts[node.script])
    return;

  const baseDir = getFilePath(`realms/${realmDir}/scripts`);
  const scriptConfigFile = objectFilePath(
    `${baseDir}/scripts-config`,
    node.script
  );
  if (!fs.existsSync(scriptConfigFile)) {
    throw missingDependency(
      journeyName,
      `the script '${node.script}'`,
      'its file is missing',
      scriptConfigFile,
      true
    );
  }

  const script = readJsonFile(scriptConfigFile) as any;

  if (script.script?.file) {
    const contentFile = referencedFilePath(baseDir, script.script.file);
    if (!fs.existsSync(contentFile)) {
      throw missingDependency(
        journeyName,
        `the script '${node.script}'`,
        'its content file is missing',
        contentFile,
        true
      );
    }
    script.script = fs.readFileSync(contentFile, 'utf8').split('\n');
  }

  scripts[node.script] = script;
}
/**
 * Process a journey directory for configManagerImportJourneys
 * @param {string} journeyName the id of the journey, or the name of its folder (a listing gives the name of the folder, a node or a person gives the id: both are found by the same folder)
 * @param {boolean} pushInnerJourneys if true processes innner journers
 * @param {boolean} pushScripts if true processes scripts
 * @param {string} journeysBaseDir base directory containing all journeys for the realm
 * @param {string} realmDir path to the realm the journey
 * @param {Set<string>} processedJourneys set of the folder names of the journeys already processed, to prevent processing the same journey multiple times
 * @param {string} neededBy the journey that has this one as an inner journey, if this is read as an inner journey
 * @returns {Record<string, SingleTreeExportInterface>} map of journey ids (the `_id` that the file of each holds) to their import data
 * @throws {Error} if the file of a journey holds no `_id`
 * @throws {MissingDependencyError} if a script, a content file or an inner journey that a journey needs is not there
 */
function processJourneyImport(
  journeyName: string,
  pushInnerJourneys: boolean,
  pushScripts: boolean,
  journeysBaseDir: string,
  realmDir: string,
  processedJourneys: Set<string> = new Set(),
  neededBy?: string
): Record<string, SingleTreeExportInterface> {
  const journeyDir = objectFolderPath(journeysBaseDir, journeyName);
  // a journey is found by its folder, whether it is listed (its folder name) or named by a node or by a person (its id)
  const folderName = path.basename(journeyDir);
  if (processedJourneys.has(folderName)) {
    return {};
  }
  processedJourneys.add(folderName);

  const journeyFile = objectFilePath(journeyDir, journeyName);
  if (neededBy !== undefined && !fs.existsSync(journeyFile)) {
    throw missingDependency(
      neededBy,
      `the journey '${journeyName}'`,
      'its file is missing',
      journeyFile,
      pushScripts
    );
  }
  const tree = readJsonFile(journeyFile) as TreeSkeleton;
  // the id of a journey is the id that its file holds: the name of its folder is the name that a pull gave it, which is a
  // shortened name for an id that does not fit in a file name
  if (typeof tree?._id !== 'string' || tree._id === '') {
    throw new Error(
      `The file '${journeyFile}' holds no '_id': the id of a journey is the id that its file holds, not the name of its folder.`
    );
  }

  const journeyData = createSingleTreeExportTemplate();
  journeyData.tree = tree;

  const innerTreeNames: string[] = [];

  const nodesDir = `${journeyDir}/nodes`;
  if (fs.existsSync(nodesDir)) {
    const entries = fs.readdirSync(nodesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        const node = readJsonFile(`${nodesDir}/${entry.name}`) as NodeSkeleton;
        journeyData.nodes[node._id] = node;

        if (pushInnerJourneys && node._type?._id === 'InnerTreeEvaluatorNode') {
          innerTreeNames.push(node.tree);
        } else {
          readNodeScript(
            node,
            pushScripts,
            journeyData.scripts,
            realmDir,
            journeyName
          );
        }
      }

      if (entry.isDirectory()) {
        const pageNodeDir = `${nodesDir}/${entry.name}`;
        const innerFiles = fs.readdirSync(pageNodeDir);
        for (const innerFile of innerFiles) {
          if (!innerFile.endsWith('.json')) continue;
          const innerNode = readJsonFile(
            `${pageNodeDir}/${innerFile}`
          ) as NodeSkeleton;
          journeyData.innerNodes[innerNode._id] = innerNode;
          readNodeScript(
            innerNode,
            pushScripts,
            journeyData.scripts,
            realmDir,
            journeyName
          );
        }
      }
    }
  }

  const trees: Record<string, SingleTreeExportInterface> = {
    [tree._id]: journeyData,
  };

  for (const innerTreeName of innerTreeNames) {
    try {
      const innerTrees = processJourneyImport(
        innerTreeName,
        pushInnerJourneys,
        pushScripts,
        journeysBaseDir,
        realmDir,
        processedJourneys,
        journeyName
      );
      Object.assign(trees, innerTrees);
    } catch (error) {
      // this journey needs the one that cannot be pushed, so it cannot be pushed either
      if (
        error instanceof MissingDependencyError &&
        !error.journeys.includes(journeyName)
      ) {
        error.journeys.push(journeyName);
      }
      throw error;
    }
  }

  return trees;
}

/**
 * Import journeys from fr-config-manager file structure
 * Every journey is imported even when another one failed, and one summary names the failed ones. A journey whose
 * script files or inner journey files are missing is not imported, and neither is a journey that needs it. The library
 * imports the journeys of a realm as one batch and reports each journey to the result callback: a journey that does not
 * validate, or that needs a journey that is neither installed nor imported, fails alone. The batch of a realm is
 * rejected as a whole only when the installed journeys cannot be listed: that fails the realm, and the other realms are
 * still imported.
 * @param {string} name optional journey name to import
 * @param {string} realm optional realm to import to
 * @param {boolean} dependencies true (the default) to push the scripts that the journeys use and the inner journeys of a journey that is named, false to push the journey alone
 * @param {boolean} validate if true, validate the journeys on import
 * @param {boolean} allowFailures true to succeed although some journeys could not be imported (the failures are still summarised)
 * @returns false if there is no journey to import (no journey files, or the named one does not exist) or a journey or realm cannot be imported (unless failures are allowed), true otherwise
 */
export async function configManagerImportJourneys(
  name?: string,
  realm?: string,
  dependencies: boolean = true,
  validate: boolean = true,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'journey', allowFailures });
  try {
    const pushInnerJourneys = !name || dependencies;
    const pushScripts = dependencies;
    const options = { deps: dependencies, reUuid: false, validate };

    const realmsDir = getFilePath('realms');
    if (!fs.existsSync(realmsDir)) {
      printMessage('No journey files found to import.', 'error');
      return false;
    }

    const realmDirs = fs
      .readdirSync(realmsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    let found = false;
    // a journey is one failure, whether it is read on its own or as the dependency of another journey
    const failedJourneys = new Set<string>();

    for (const realmDir of realmDirs) {
      state.setRealm(realmDir === 'root' ? '/' : realmDir);

      if (
        (state.getRealm() === '/' &&
          state.getDeploymentType() ===
            frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY) ||
        (realm !== DEFAULT_REALM_KEY && state.getRealm() !== realm)
      )
        continue;

      const journeysBaseDir = `${realmsDir}/${realmDir}/journeys`;
      if (!fs.existsSync(journeysBaseDir)) continue;

      const journeyNames = name
        ? [name]
        : fs
            .readdirSync(journeysBaseDir, { withFileTypes: true })
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name);

      const trees: Record<string, any> = {};

      for (const journeyName of journeyNames) {
        if (!fs.existsSync(objectFolderPath(journeysBaseDir, journeyName)))
          continue;
        found = true;

        try {
          Object.assign(
            trees,
            processJourneyImport(
              journeyName,
              pushInnerJourneys,
              pushScripts,
              journeysBaseDir,
              realmDir
            )
          );
        } catch (error) {
          // the files of this journey, or of a journey that it needs, cannot be read: the others are still imported
          printError(error, `Error reading journey ${printable(journeyName)}`);
          const failed =
            error instanceof MissingDependencyError
              ? error.journeys
              : [journeyName];
          for (const failedName of failed) {
            const failure = `${realmDir}/${printable(failedName)}`;
            if (failedJourneys.has(failure)) continue;
            failedJourneys.add(failure);
            run.recordFailure(failure, causeOf(error));
          }
        }
      }

      if (Object.keys(trees).length) {
        try {
          // the library counts each journey it imported or failed to import
          await importJourneys({ trees }, options, run.resultCallback());
        } catch (error) {
          // not a journey failure: the library rejected the whole batch of this realm
          printError(error, `Error importing journeys of realm ${realmDir}`);
          run.recordFailure(`${realmDir} realm`, causeOf(error));
        }
      }
    }

    if (!found) {
      printMessage('No journey files found to import.', 'error');
      return false;
    }

    return run.finish();
  } catch (error) {
    printError(error, `Error importing journeys`);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/** What a delete of journeys needs to know besides the id, the realm and the dry run. */
export type DeleteJourneysOptions = {
  /** Delete a named journey although other objects still name it: clear them first. */
  force?: boolean;
  /** With `force`: leave the links of the themes as they are. */
  keepLinks?: boolean;
  /** With `dryRun`: the dry run is the plan that is shown before a question, so its text says plan and not dry run. */
  plan?: boolean;
};

/** The deletion of one journey or of every journey is one operation of the run, and so is each orphaned node. */
const DELETE_UNIT = 'deletion';

/**
 * Delete one journey by id, or every journey of the realms and then their
 * orphaned nodes. Skips the root realm on Cloud deployments when no journey is
 * named.
 *
 * A named journey is looked up in the list of the realm (an exact, case-sensitive
 * match) and the listed id is what is deleted: the id of the command line is
 * never put into a request, so it cannot be anything but an id. Before it is
 * deleted, the library is asked what still names it. Anything that does, hard or
 * soft, stops the delete, until `force` is given: then the journey is cleared
 * out of the OAuth2 clients, SAML providers and AI agents that name it, removed
 * from the themes that link it (unless `keepLinks`), and deleted; every other
 * holder is left alone and reported.
 *
 * A dry run deletes nothing, orphaned nodes included, and writes nothing: it
 * reads, and says what would be done.
 * @param {string} id Exact journey id. A named delete needs a single realm. An empty id is an error, never "all".
 * @param {string} realm Realm to process. Omit to use every realm, for a delete of all journeys.
 * @param {boolean} dryRun Show what would be done without doing any of it.
 * @param {boolean} allowFailures Keep the result true when a deletion failed. Neither a named journey that does not exist, nor a refusal because something still names it, nor a failed clearing is a failure that it can turn into success.
 * @param {DeleteJourneysOptions} options `force` and `keepLinks`, for a named delete, and `plan`.
 * @returns {Promise<boolean>} False if the arguments are refused, the realms cannot be listed, a named journey is not in the realm or is still named by something and `force` was not given, a clearing failed, or, unless failures are allowed, a deletion failed. Nothing to delete is a success.
 */
export async function configManagerDeleteJourneys(
  id?: string,
  realm?: string,
  dryRun = false,
  allowFailures = false,
  { force = false, keepLinks = false, plan = false }: DeleteJourneysOptions = {}
): Promise<boolean> {
  // "not given" and "given but empty" are different: an empty id must never
  // select every journey
  if (id === '') {
    printMessage(
      'The journey id must not be empty. To delete all journeys, leave out the id.',
      'error'
    );
    return false;
  }
  const concreteRealm =
    realm && realm !== DEFAULT_REALM_KEY ? realm : undefined;
  if (id !== undefined && !concreteRealm) {
    printMessage(
      'The -i, --journey-id option requires a realm argument to be specified.',
      'error'
    );
    return false;
  }
  // the realm is set per realm below; the caller (for example the question of
  // the bulk-delete guard, which names the realm) must find it as it was
  const realmBefore = state.getRealm();
  try {
    if (id !== undefined) {
      return await deleteNamedJourney(
        id,
        concreteRealm,
        dryRun,
        allowFailures,
        force,
        keepLinks,
        plan
      );
    }
    let realms: string[];
    try {
      realms = concreteRealm ? [concreteRealm] : await realmList();
    } catch (error) {
      printError(error, 'Error reading realms');
      return false;
    }
    return await deleteAllJourneys(realms, dryRun, allowFailures);
  } finally {
    state.setRealm(realmBefore);
  }
}

/** The message of a realm that holds no journey. */
function printNoJourneys(realm: string): void {
  printMessage(`No journeys found to delete in realm '${realm}'.`, 'warn');
}

/** The lines that say what a delete with `--force` does, before it does it. */
function planLines(
  journeyId: string,
  realm: string,
  plan: JourneyDeletePlan,
  lookupFailed = false,
  asPlan = false
): string[] {
  // the plan before a question is not a dry run: it says what is about to be done
  const lines = [
    asPlan
      ? `Plan: journey '${journeyId}' in realm '${realm}' would be deleted.`
      : `Dry run: would delete journey '${journeyId}' in realm '${realm}'.`,
  ];
  const section = (title: string, items: { toString(): string }[]) => {
    if (items.length === 0) return;
    lines.push(`  ${title}`, ...items.map((item) => `    - ${item}`));
  };
  section(
    'Before that, clear the journey in these:',
    plan.clear.map(describeReference)
  );
  section(
    'Before that, remove the journey from the list of journeys of these themes (--keep-links leaves it):',
    plan.removeLinks.map(describeReference)
  );
  section(
    'Keep the link in these themes (--keep-links):',
    plan.kept.map(describeReference)
  );
  section(
    'Leave these alone, they would name a journey that does not exist afterwards:',
    plan.dangling.map(referenceLine)
  );
  if (lookupFailed) {
    // an empty plan is not "nothing names it": the sources could not all be read
    lines.push(
      '  What else names the journey is not known: not every source could be read, so nothing is cleared.'
    );
  } else if (lines.length === 1) {
    lines.push(
      asPlan
        ? '  Nothing else names the journey: no other object is changed.'
        : '  nothing else names the journey.'
    );
  }
  return lines;
}

/** What still names the journey, one line each, for a message. */
function namedByLines(references: JourneyReference[]): string[] {
  return references.map((reference) => `  - ${referenceLine(reference)}`);
}

/**
 * Asks the library what names a journey. A lookup that cannot read every source
 * fails closed (it never answers from a part of the sources), and so does this.
 * @param {string} journeyId the journey
 * @returns {Promise<{ references?: JourneyReference[]; unreadable?: string[] }>} the references, or one line for each source that could not be read
 */
async function lookUpReferences(
  journeyId: string
): Promise<{ references?: JourneyReference[]; unreadable?: string[] }> {
  try {
    return {
      references: await frodo.authn.journey.findJourneyReferences(journeyId),
    };
  } catch (error) {
    return { unreadable: unreadableSources(error) };
  }
}

/**
 * Delete one journey of one realm. See {@link configManagerDeleteJourneys}.
 * @param {string} id the id of the command line
 * @param {string} realm the realm
 * @param {boolean} dryRun show what would be done
 * @param {boolean} allowFailures keep the result true when the delete failed
 * @param {boolean} force go ahead although something names the journey
 * @param {boolean} keepLinks leave the links of the themes
 * @param {boolean} asPlan the dry run is the plan shown before a question
 * @returns {Promise<boolean>} true if the command succeeded
 */
async function deleteNamedJourney(
  id: string,
  realm: string,
  dryRun: boolean,
  allowFailures: boolean,
  force: boolean,
  keepLinks: boolean,
  asPlan: boolean
): Promise<boolean> {
  state.setRealm(realm);
  let journeys: TreeSkeleton[];
  try {
    journeys = await readJourneys();
  } catch (error) {
    printError(error, `Error reading the journeys of realm '${realm}'`);
    return false;
  }
  const journey = journeys.find((candidate) => candidate._id === id);
  const { references, unreadable } = await lookUpReferences(id);

  if (!journey) {
    // a named journey that is not there is not an operation that failed among
    // others: it fails the command whatever --allow-failures says
    printMessage(`Journey '${id}' not found in realm '${realm}'.`, 'error');
    if (references && references.length > 0) {
      printMessage(
        `Still named in realm '${realm}':\n${namedByLines(references).join('\n')}` +
          (references.some((reference) => reference.source === 'ai-agent')
            ? '\nAn AI agent that names a journey that does not exist can no longer be updated or deleted. To repair it, create a journey with that name, clear the journey in the AI agent, and delete the journey again.'
            : ''),
        'warn'
      );
    }
    return false;
  }
  // the listed id is what is deleted, never the text that was typed
  const target = journey._id as string;

  if (unreadable) {
    printMessage(
      `Cannot tell what still names journey '${target}' in realm '${realm}': these could not be read:\n${unreadable
        .map((line) => `  - ${line}`)
        .join('\n')}`,
      'error'
    );
    if (!force) {
      printMessage(
        'Nothing was deleted. --force deletes the journey without that check.',
        'error'
      );
      return false;
    }
    printMessage(
      `Because --force was given, the journey ${dryRun ? 'would be' : 'is'} deleted without that check: nothing that names it is cleared, and Access Management can still refuse the delete.`,
      'warn'
    );
  }

  const found = references ?? [];
  if (found.length > 0 && !force) {
    printMessage(
      `${dryRun ? 'Dry run: the delete would be refused. ' : ''}Journey '${target}' in realm '${realm}' is still named by:\n${namedByLines(found).join('\n')}\nNothing was deleted. --force deletes it anyway: it clears the journey in OAuth2 clients, SAML providers and AI agents, removes it from the themes (--keep-links leaves them), and leaves every other holder naming a journey that does not exist.`,
      'error'
    );
    return false;
  }

  const plan = planJourneyDelete(found, { keepLinks });
  if (dryRun) {
    printMessage(
      planLines(target, realm, plan, unreadable !== undefined, asPlan).join(
        '\n'
      )
    );
    return true;
  }

  // clear first, then delete: an AI agent that names a journey that is gone can
  // no longer be updated, so nothing is deleted after a clearing that failed
  const run = new OperationRun({ unit: 'step', allowFailures });
  // the holders that were changed and stay so, and the ones whose step failed
  // after it wrote them, so that they may differ from what they were
  const changedHolders: string[] = [];
  const notRestored: string[] = [];
  const stepFailed = (error: unknown, reference: JourneyReference) => {
    if ((error as ClearingError).holderChanged) {
      notRestored.push(describeReference(reference));
    }
  };
  let stepsDone = true;
  for (const reference of plan.clear) {
    const done = await run.run(
      `clear the journey in ${describeReference(reference)}`,
      async () => {
        try {
          const { was } = await clearJourneyReference(reference, target);
          changedHolders.push(describeReference(reference));
          printMessage(
            `Cleared the journey in ${describeReference(reference)} (it held '${was}').`
          );
        } catch (error) {
          stepFailed(error, reference);
          throw error;
        }
      },
      { dependent: true }
    );
    stepsDone &&= done;
  }
  for (const reference of plan.removeLinks) {
    const done = await run.run(
      `remove the journey from ${describeReference(reference)}`,
      async () => {
        try {
          const { was } = await unlinkJourneyReference(reference, target);
          changedHolders.push(describeReference(reference));
          printMessage(
            `Removed journey '${target}' from ${describeReference(reference)} (the list held '${was}').`
          );
        } catch (error) {
          stepFailed(error, reference);
          throw error;
        }
      },
      { dependent: true }
    );
    stepsDone &&= done;
  }
  const deleteStep = `delete journey '${target}'`;
  let deleted = false;
  if (!stepsDone) {
    // a step before it failed and stopped the run: the summary says that the
    // delete was not attempted
    await run.run(deleteStep, () => undefined);
  } else {
    try {
      // the library answers a failed delete with a status that carries the
      // error, and does not throw
      const status = await deleteJourney(target, {
        deep: false,
        verbose: false,
        progress: false,
      });
      if (status.status !== 'success') {
        throw (
          (status as { error?: FrodoError }).error ??
          new Error(
            `Journey '${target}' in realm '${realm}' could not be deleted.`
          )
        );
      }
      run.recordSuccess();
      deleted = true;
      printMessage(`Deleted journey '${target}' in realm '${realm}'.`);
    } catch (error) {
      printError(error as Error);
      // the summary carries the cause, as the one of a delete of all journeys
      // does. The delete is a step like any other that fails: --allow-failures
      // applies, and the closing text below says what stays changed
      run.recordFailure(deleteStep, causeOf(error));
    }
  }
  if (deleted) {
    if (plan.kept.length > 0) {
      printMessage(
        `Kept the link of the journey in these themes (--keep-links):\n${plan.kept.map((reference) => `  - ${describeReference(reference)}`).join('\n')}`,
        'warn'
      );
    }
    if (plan.dangling.length > 0) {
      printMessage(
        `Left alone, these now name a journey that does not exist:\n${plan.dangling.map((reference) => `  - ${referenceLine(reference)}`).join('\n')}`,
        'warn'
      );
    }
  } else if (stepsDone && force) {
    // the delete itself failed, although everything before it went well: say
    // what still names the journey
    const again = await lookUpReferences(target);
    if (again.references && again.references.length > 0) {
      printMessage(
        `Still named by:\n${namedByLines(again.references).join('\n')}`,
        'warn'
      );
    }
  }
  const succeeded = run.finish();
  if (!deleted && (changedHolders.length > 0 || notRestored.length > 0)) {
    printMessage(
      `Journey '${target}' was not deleted.` +
        (changedHolders.length > 0
          ? `\nChanged before, and they stay changed: ${changedHolders.join('; ')}.`
          : '') +
        (notRestored.length > 0
          ? `\nChanged by the step that failed, and NOT restored: ${notRestored.join('; ')}.`
          : '') +
        `\nTo undo, set the journey '${target}' in each of them again. To finish, run the command again: a holder that was cleared no longer names it.`,
      'warn'
    );
  }
  return succeeded;
}

/**
 * Delete every journey of the realms, then every orphaned node of each realm.
 * See {@link configManagerDeleteJourneys}.
 * @param {string[]} realms the realms
 * @param {boolean} dryRun show what would be deleted
 * @param {boolean} allowFailures keep the result true when a deletion failed
 * @returns {Promise<boolean>} true if the command succeeded
 */
async function deleteAllJourneys(
  realms: string[],
  dryRun: boolean,
  allowFailures: boolean
): Promise<boolean> {
  if (realms.length === 0) {
    printMessage('No realms found to delete journeys from.', 'warn');
    return true;
  }
  const run = new OperationRun({ unit: DELETE_UNIT, allowFailures });
  let journeyCount = 0;
  let orphanCount = 0;
  if (dryRun) {
    printMessage(
      'Dry run: nothing is deleted. A delete of all journeys deletes every journey of the realm, the journeys that the realm uses for login included, and then every orphaned node of the realm, also a node that never belonged to a deleted journey.'
    );
  }
  for (const currentRealm of realms) {
    if (
      currentRealm === '/' &&
      state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
    ) {
      printMessage('The root realm (/) is skipped on a Cloud tenant.');
      continue;
    }
    state.setRealm(currentRealm);

    try {
      if (dryRun) {
        const journeys = await readJourneys();
        for (const journey of journeys) {
          printMessage(
            `Dry run: would delete journey '${journey._id}' in realm '${currentRealm}'.`
          );
        }
        journeyCount += journeys.length;
        if (journeys.length === 0) printNoJourneys(currentRealm);
      } else {
        // without `deep`: the delete of a journey already takes its nodes with it,
        // and the orphaned nodes that are left are cleaned up below. The library
        // tries every journey and answers with the status of each, a failed one
        // included (it carries the error); it throws only when it cannot list them
        const statuses = await deleteJourneys({ deep: false, verbose: false });
        for (const [journeyId, status] of Object.entries(statuses)) {
          if (status.status === 'success') {
            printMessage(
              `Deleted journey '${journeyId}' in realm '${currentRealm}'.`
            );
            run.recordSuccess();
            journeyCount += 1;
          } else {
            const error = (status as { error?: FrodoError }).error;
            printError(
              error ??
                new Error(
                  `Journey '${journeyId}' in realm '${currentRealm}' could not be deleted.`
                )
            );
            run.recordFailure(
              `journey '${journeyId}' in realm '${currentRealm}'`,
              error === undefined ? undefined : causeOf(error)
            );
          }
        }
        if (Object.keys(statuses).length === 0) printNoJourneys(currentRealm);
      }
    } catch (error) {
      printError(
        error,
        `Error deleting the journeys of realm '${currentRealm}'`
      );
      run.recordFailure(
        `the journeys of realm '${currentRealm}'`,
        causeOf(error)
      );
    }

    try {
      const orphans = await frodo.authn.node.findOrphanedNodes();
      const describeNode = (node: NodeSkeleton) =>
        `orphaned node '${node._id}' (${node._type._id}${node._type.version ? ` ${node._type.version}` : ''}) in realm '${currentRealm}'`;
      if (orphans.length === 0) {
        printMessage(`No orphaned nodes found in realm '${currentRealm}'.`);
      } else if (dryRun) {
        for (const node of orphans) {
          printMessage(`Dry run: would delete ${describeNode(node)}.`);
        }
        orphanCount += orphans.length;
      } else {
        const failed = new Set(
          (
            await frodo.authn.node.removeOrphanedNodes(
              orphans,
              run.resultCallback()
            )
          ).map((node) => node._id)
        );
        for (const node of orphans) {
          if (!failed.has(node._id)) {
            printMessage(`Deleted ${describeNode(node)}.`);
            orphanCount += 1;
          }
        }
      }
    } catch (error) {
      printError(
        error,
        `Error deleting the orphaned nodes of realm '${currentRealm}'`
      );
      run.recordFailure(
        `the orphaned nodes of realm '${currentRealm}'`,
        causeOf(error)
      );
    }
  }

  printMessage('--- Journey deletion summary ---');
  if (dryRun) {
    printMessage(`Journeys that would be deleted: ${journeyCount}`);
    printMessage(
      `Orphaned nodes that would be deleted: ${orphanCount} (only the orphaned nodes that exist now; nodes that the deleted journeys would leave behind are not counted)`
    );
  } else {
    printMessage(`Journeys deleted: ${journeyCount}`);
    printMessage(`Orphaned nodes deleted: ${orphanCount}`);
  }
  return run.finish();
}
