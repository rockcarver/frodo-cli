import {
  NodeSkeleton,
  TreeSkeleton,
} from '@rockcarver/frodo-lib/types/api/ApiTypes';
import {
  SingleTreeExportInterface,
  TreeDependencyMapInterface,
  TreeExportResolverInterface,
} from '@rockcarver/frodo-lib/types/ops/OpsTypes';
import { printMessage } from '../utils/Console';
import { Journey, Types, state } from '@rockcarver/frodo-lib';
import * as CirclesOfTrust from './CirclesOfTrustOps';
import * as EmailTemplate from './EmailTemplateOps';
import * as Idp from './IdpOps';
import * as Node from './NodeOps';
import * as Saml2 from './Saml2Ops';
import * as Script from './ScriptOps';
import * as Theme from './ThemeOps';

const {
  onlineTreeExportResolver,
  getTreeDescendents,
  getNodeRef,
} = Journey;

/**
 * Get journey classification
 * @param {SingleTreeExportInterface} journey journey export
 * @returns {stringp[]} Colored string array of classifications
 */
export function getJourneyClassification(journey: SingleTreeExportInterface): string[] {
  return Journey.getJourneyClassification(journey).map((it) => {
    switch (it) {
      case Types.JourneyClassification.STANDARD:
        return it.toString()['brightGreen'];

      case Types.JourneyClassification.CLOUD:
        return it.toString()['brightMagenta'];

      case Types.JourneyClassification.CUSTOM:
        return it.toString()['brightRed'];

      case Types.JourneyClassification.PREMIUM:
        return it.toString()['brightYellow'];
    }
  });
}

/**
 * Get a one-line description of the tree object
 * @param {TreeSkeleton} treeObj circle of trust object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(treeObj: TreeSkeleton): string {
  const description = `[${treeObj._id['brightCyan']}]`;
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
    printMessage(`${indent}- ${tree['brightCyan']}`, 'data');
    for (const descendent of descendents[tree]) {
      describeTreeDescendents(descendent, depth + 1);
    }
  }
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
 */
export async function describeJourney(
  journeyData: SingleTreeExportInterface,
  resolveTreeExport: TreeExportResolverInterface = onlineTreeExportResolver
): Promise<void> {
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

  // Journey Name
  printMessage(`${getOneLineDescription(journeyData.tree)}`, 'data');
  printMessage(Array(`[${journeyData.tree._id}]`['length']).fill('=').join(''));

  // Description
  if (journeyData.tree.description) {
    printMessage(`\n${journeyData.tree.description}`, 'data');
  }

  // Status
  printMessage(
    `\nStatus\n${
      journeyData.tree.enabled === false
        ? 'disabled'['brightRed']
        : 'enabled'['brightGreen']
    }`
  );

  // Classification
  if (
    !state.default.session.getAmVersion() &&
    journeyData.meta?.originAmVersion
  ) {
    state.default.session.setAmVersion(journeyData.meta.originAmVersion);
  }
  if (state.default.session.getAmVersion()) {
    printMessage(
      `\nClassification\n${getJourneyClassification(journeyData).join(', ')}`,
      'data'
    );
  }

  // Categories/Tags
  if (journeyData.tree.uiConfig?.categories && journeyData.tree.uiConfig.categories != '[]') {
    printMessage('\nCategories/Tags', 'data');
    printMessage(
      `${
        JSON.parse(journeyData.tree.uiConfig.categories).join(', ')
      }`,
      'data'
    );
  }

  // Dependency Tree
  const descendents = await getTreeDescendents(journeyData, resolveTreeExport);
  describeTreeDescendents(descendents);

  // Node Types
  if (Object.entries(nodeTypeMap).length) {
    printMessage(
      `\nNode Types (${Object.entries(nodeTypeMap).length}):`,
      'data'
    );
    for (const [nodeType, count] of Object.entries(nodeTypeMap)) {
      printMessage(
        `- ${String(count)} [${
          nodeType['brightCyan']
        }] (${Node.getNodeClassification(nodeType).join(', ')})`,
        'data'
      );
    }
  }

  // Nodes
  if (Object.entries(allNodes).length) {
    printMessage(`\nNodes (${Object.entries(allNodes).length}):`, 'data');
    for (const nodeObj of Object.values<NodeSkeleton>(allNodes)) {
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
    for (const scriptData of Object.values(journeyData.scripts)) {
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
    for (const templateData of Object.values(journeyData.emailTemplates)) {
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
    for (const socialIdpData of Object.values(
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
    for (const entityProviderData of Object.values(journeyData.saml2Entities)) {
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
    for (const cotData of Object.values(journeyData.circlesOfTrust)) {
      printMessage(
        `- ${CirclesOfTrust.getOneLineDescription(cotData)}`,
        'data'
      );
    }
  }
}
