import { frodo, state } from '@rockcarver/frodo-lib';
import {
  MultiTreeExportInterface,
  TreeExportOptions,
} from '@rockcarver/frodo-lib/types/ops/JourneyOps';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, verboseMessage } from '../utils/Console';
import { existScript, realmList, safeFileName } from '../utils/FrConfig';

const { saveJsonToFile, getFilePath } = frodo.utils;
const { exportJourneys } = frodo.authn.journey;

export async function configManagerExportJourneys(
  name?,
  realm?,
  pullDependency?
  // TO DO: clean?
): Promise<boolean> {
  const options: TreeExportOptions = {
    deps: pullDependency,
    useStringArrays: true,
    coords: true,
  };

  try {
    if (realm && realm !== '__default__realm__') {
      const exportData = (await exportJourneys(
        options
      )) as MultiTreeExportInterface;
      processJourneys(exportData.trees, realm, name, pullDependency, 'realms');
    } else {
      for (const realm of await realmList()) {
        state.setRealm(realm);
        const exportData = (await exportJourneys(
          options
        )) as MultiTreeExportInterface;
        await processJourneys(
          exportData.trees,
          realm,
          name,
          pullDependency,
          'realms'
        );
      }
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity endpoints`);
  }
  return false;
}

function matchJourneyName(journey, name) {
  return journey.tree._id === name;
}

function fileNameFromNode(displayName, id) {
  return safeFileName(`${displayName} - ${id}`);
}

async function processJourneys(
  journeys,
  realm,
  name,
  pullDependencies,
  exportDir
) {
  const fileDir = `${exportDir}/${realm}/journeys`;
  try {
    for (const [, journey] of Object.entries(journeys) as [string, any]) {
      if (name && !matchJourneyName(journey, name)) {
        continue;
      }
      const journeyDir = `${fileDir}/${journey.tree._id}`;
      const nodeDir = `${journeyDir}/nodes`;
      const scriptJsonDir = `realms/${realm}/scripts/scripts-config`;

      for (const [nodeId, node] of Object.entries(journey.nodes) as [
        string,
        any,
      ]) {
        const nodeFileNameRoot = `${nodeDir}/${fileNameFromNode(journey.tree.nodes[nodeId].displayName, nodeId)}`;

        if (node._type._id === 'PageNode') {
          for (const subNode of node.nodes) {
            const subNodeSpec = journey.innerNodes[subNode._id];

            const subNodeFilename = `${nodeFileNameRoot}/${fileNameFromNode(subNode.displayName, subNode._id)}.json`;
            saveJsonToFile(
              subNodeSpec,
              getFilePath(subNodeFilename, true),
              false,
              true
            );
            if (
              pullDependencies &&
              journeyNodeNeedsScript(subNodeSpec) &&
              !(await existScript(subNodeSpec.script, realm))
            ) {
              const script = journey.scripts[subNodeSpec.script];

              const scriptText = Array.isArray(script.script)
                ? script.script.join('\n')
                : script.script;
              const scriptExtractDir = `realms/${realm}/scripts/`;
              const scriptExtractName = `scripts-content/${script.context}/${script.name}.js`;
              extractFrConfigDataToFile(
                scriptText,
                scriptExtractName,
                scriptExtractDir
              );
              script.script = { file: `${scriptExtractName}` };

              saveJsonToFile(
                script,
                getFilePath(`${scriptJsonDir}/${script._id}.json`, true),
                false,
                true
              );
            }
          }
        } else if (
          pullDependencies &&
          journeyNodeNeedsScript(node) &&
          !(await existScript(node.script, realm))
        ) {
          verboseMessage('Trying to save the script on the node');
          verboseMessage(nodeId);
          verboseMessage(node.script);

          const script = journey.scripts[node.script];
          const scriptText = Array.isArray(script.script)
            ? script.script.join('\n')
            : script.script;
          const scriptExtractDir = `realms/${realm}/scripts`;
          const scriptExtractName = `scripts-content/${script.context}/${script.name}.js`;
          extractFrConfigDataToFile(
            scriptText,
            scriptExtractName,
            scriptExtractDir
          );

          script.script = { file: `${scriptExtractName}` };
          saveJsonToFile(
            script,
            getFilePath(`${scriptJsonDir}/${script._id}.json`, true),
            false,
            true
          );
        } else if (
          !!name &&
          pullDependencies &&
          node._type._id === 'InnerTreeEvaluatorNode'
        ) {
          await processJourneys(
            journeys,
            realm,
            node.tree,
            pullDependencies,
            exportDir
          );
        }

        saveJsonToFile(
          node,
          getFilePath(`${nodeFileNameRoot}.json`, true),
          false,
          true
        );
      }

      const fileName = `${journeyDir}/${journey.tree._id}.json`;
      saveJsonToFile(
        journey.tree,
        getFilePath(`${fileName}`, true),
        false,
        true
      );
    }
  } catch (err) {
    printError(err);
  }
}

function journeyNodeNeedsScript(node) {
  return (
    // eslint-disable-next-line no-prototype-builtins
    node.hasOwnProperty('script') &&
    // eslint-disable-next-line no-prototype-builtins
    (!node.hasOwnProperty('useScript') || node.useScript)
  );
}
