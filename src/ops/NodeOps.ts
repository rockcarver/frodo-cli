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
