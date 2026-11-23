import path from 'node:path';
import fs from 'fs';
import {
  frodo,
  state,
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
  fileNameOf,
  objectFilePath,
  objectFolderPath,
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

const { saveJsonToFile, getFilePath, readJsonFile } = frodo.utils;
const { exportScript } = frodo.script;
const { exportJourneys, importJourneys, createSingleTreeExportTemplate } =
  frodo.authn.journey;
const { DEFAULT_REALM_KEY } = frodo.utils.constants;

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
    for (const realmName of realmNames) {
      if (
        realmName === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      // the tenant names the realm: it is the name of a folder here, never a path
      let realmDir: string;
      try {
        realmDir = realmFolderOf(realmName);
      } catch (error) {
        const reason = printable(causeOf(error));
        printMessage(`${reason} Its journeys are not pulled.`, 'error');
        run.recordFailure(`realm ${printable(realmName)}`, reason);
        continue;
      }
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
        run
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
 */
async function processNodeExport(
  node: NodeSkeleton,
  displayName: string,
  nodeDir: string,
  realmDir: string,
  pullDependencies: boolean,
  journey: SingleTreeExportInterface
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
        journey
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
    script.script = extractFrConfigDataToFile(
      script.script,
      `scripts-content/${fileNameOf(String(script.context))}/${fileNameOf(String(script.name))}.js`,
      scriptsDir
    ) as any;
    saveJsonToFile(
      script,
      objectFilePath(getFilePath(`${scriptsDir}scripts-config`), script._id),
      false,
      true,
      true
    );
  }
  saveJsonToFile(
    node,
    getFilePath(`${nodeFileDir}.json`, true),
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
 */
async function processJourneysExport(
  journeys: Record<string, SingleTreeExportInterface>,
  realmDir: string,
  name?: string,
  pullDependencies: boolean = true,
  clean: boolean = false,
  run?: OperationRun,
  exported: Set<string> = new Set()
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
      if (clean) {
        fs.rmSync(getFilePath(nodeDir), { recursive: true, force: true });
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
            exported
          );
        }
        await processNodeExport(
          node,
          journey.tree.nodes[node._id].displayName,
          nodeDir,
          realmDir,
          pullDependencies,
          journey
        );
      }
      // the file of the journey has the name of its folder, which is the name a push reads
      saveJsonToFile(
        journey.tree,
        getFilePath(objectFilePath(journeyDir, treeId), true),
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
 * @param {string} journeyName name of the journey
 * @param {boolean} pushInnerJourneys if true processes innner journers
 * @param {boolean} pushScripts if true processes scripts
 * @param {string} journeysBaseDir base directory containing all journeys for the realm
 * @param {string} realmDir path to the realm the journey
 * @param {Set<string>} processedJourneys set of already-processed journey names to prevent processing the same journey multiple times
 * @param {string} neededBy the journey that has this one as an inner journey, if this is read as an inner journey
 * @returns {Record<string, SingleTreeExportInterface>} map of journey names to their import data
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
  if (processedJourneys.has(journeyName)) {
    return {};
  }
  processedJourneys.add(journeyName);

  const journeyDir = objectFolderPath(journeysBaseDir, journeyName);
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
    [journeyName]: journeyData,
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
