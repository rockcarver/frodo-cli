import {
  InnerNodeRefSkeletonInterface,
  NodeRefSkeletonInterface,
  NodeSkeleton,
} from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { Node, Types } from '@rockcarver/frodo-lib';

/**
 * Get node classification
 * @param {string} nodeType node type
 * @returns {stringp[]} Colored string array of classifications
 */
export function getNodeClassification(nodeType: string): string[] {
  return Node.getNodeClassification(nodeType).map((it) => {
    switch (it) {
      case Types.NodeClassification.STANDARD:
        return it.toString()['brightGreen'];

      case Types.NodeClassification.CLOUD:
        return it.toString()['brightMagenta'];

      case Types.NodeClassification.CUSTOM:
        return it.toString()['brightRed'];

      case Types.NodeClassification.PREMIUM:
        return it.toString()['brightYellow'];
    }
  });
}

/**
 * Get node classification in markdown
 * @param {string} nodeType node type
 * @returns {stringp[]} Colored string array of classifications
 */
export function getNodeClassificationMd(nodeType: string): string[] {
  return Node.getNodeClassification(nodeType).map((it) => {
    switch (it) {
      case Types.NodeClassification.STANDARD:
        return `:green_circle: \`${it.toString()}\``;

      case Types.NodeClassification.CLOUD:
        return `:purple_circle: \`${it.toString()}\``;

      case Types.NodeClassification.CUSTOM:
        return `:red_circle: \`${it.toString()}\``;

      case Types.NodeClassification.PREMIUM:
        return `:yellow_circle: \`${it.toString()}\``;
    }
  });
}

/**
 * Get a one-line description of the node
 * @param {NodeSkeleton} nodeObj node object to describe
 * @param {NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface} nodeRef node reference object
 * @returns {string} a one-line description
 */
export function getOneLineDescription(
  nodeObj: NodeSkeleton,
  nodeRef?: NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface
): string {
  const description = `[${nodeObj._id['brightCyan']}] (${getNodeClassification(
    nodeObj._type._id
  ).join(', ')}) ${nodeObj._type._id}${
    nodeRef ? ' - ' + nodeRef?.displayName : ''
  }`;
  return description;
}

/**
 * Get a one-line description of the node in markdown
 * @param {NodeSkeleton} nodeObj node object to describe
 * @param {NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface} nodeRef node reference object
 * @returns {string} a one-line description in markdown
 */
export function getOneLineDescriptionMd(
  nodeObj: NodeSkeleton,
  nodeRef?: NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface
): string {
  const description = `${nodeObj._id} (${getNodeClassificationMd(
    nodeObj._type._id
  ).join(', ')}) ${nodeObj._type._id}${
    nodeRef ? ' - ' + nodeRef?.displayName : ''
  }`;
  return description;
}

/**
 * Get markdown table header
 * @returns {string} markdown table header
 */
export function getTableHeaderMd(): string {
  let markdown = '';
  markdown += '| Display Name | Type | Classification | Id |\n';
  markdown += '| ------------ | ---- | -------------- | ---|';
  return markdown;
}

/**
 * Get a table-row of the node in markdown
 * @param {NodeSkeleton} nodeObj node object to describe
 * @param {NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface} nodeRef node reference object
 * @returns {string} a table-row of the node in markdown
 */
export function getTableRowMd(
  nodeObj: NodeSkeleton,
  nodeRef?: NodeRefSkeletonInterface | InnerNodeRefSkeletonInterface
): string {
  const row = `| ${nodeRef ? nodeRef.displayName : ''} | ${
    nodeObj._type._id
  } | ${getNodeClassificationMd(nodeObj._type._id).join('<br>')} | \`${
    nodeObj._id
  }\` |`;
  return row;
}
