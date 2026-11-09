/**
 * What `config-manager pull journeys` and `pull all` print when a journey
 * cannot be exported because some of its nodes cannot be read. The library
 * reports such a journey with one error that nests one error per node, and the
 * default printout of that error repeats the title of the journey and shows a
 * full network-error block (URL, status, code, reason, message) for every node.
 * When every one of those nodes answered "not found" (HTTP 404), the whole error
 * says one thing: these nodes are not on the tenant. That is summarised here;
 * an error that carries anything else is left to the detailed printout, so that
 * nothing a person needs to act on is hidden.
 *
 * The functions read the shape of the error, never import the library, and
 * change nothing.
 */

/** A node that the tenant does not have. */
export interface MissingNode {
  type: string;
  id: string;
}

/** A journey that could not be exported only because nodes of it were not found. */
export interface MissingNodes {
  realm: string;
  journeyId: string;
  nodes: MissingNode[];
}

type Link = {
  message?: unknown;
  originalErrors?: unknown;
  httpStatus?: unknown;
  httpMessage?: unknown;
  httpErrorText?: unknown;
  httpErrorReason?: unknown;
  httpDetail?: unknown;
  httpDescription?: unknown;
  response?: { status?: unknown; data?: Record<string, unknown> };
};

/** The title that the library gives the error of one journey of an export. */
const JOURNEY_TITLE = /^Error exporting the (\S+) realm journey (.+)$/;
/** The wrapper that the library puts around the errors of the parts of one journey. */
const JOURNEY_WRAPPER = /^Error exporting \S+ realm journey /;
/** The first line of the error of one node. */
const NODE_TITLE = /^Error reading (\S+) node (\S+)$/;

const causesOf = (error: Link): Link[] =>
  Array.isArray(error?.originalErrors) ? (error.originalErrors as Link[]) : [];

const messageOf = (error: Link): string =>
  typeof error?.message === 'string' ? error.message : '';

/** True for text that says nothing beyond the status: empty or "Not Found". */
function isPlainNotFoundText(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return (
    typeof value === 'string' && value.trim().toLowerCase() === 'not found'
  );
}

/**
 * True if the error was caused by a "not found" answer and by nothing else:
 * the deepest error of the chain carries the status 404 and no text of the
 * server beyond "Not Found".
 * @param {Link} item the error of one node
 * @returns {boolean} true if the item is a plain "not found"
 */
function isPlainNotFound(item: Link): boolean {
  let link = item;
  let status: unknown;
  let plain = true;
  for (let depth = 0; depth < 10; depth++) {
    const data = link.response?.data;
    status = link.response?.status ?? link.httpStatus ?? status;
    plain =
      plain &&
      [
        link.httpMessage,
        link.httpErrorText,
        link.httpErrorReason,
        link.httpDetail,
        link.httpDescription,
        data?.message,
        data?.error,
        data?.reason,
        data?.detail,
        data?.error_description,
      ].every(isPlainNotFoundText);
    const causes = causesOf(link);
    if (causes.length > 1) return false;
    if (causes.length === 0) break;
    link = causes[0];
  }
  return status === 404 && plain;
}

/** The lines of a network error that a plain "not found" consists of. */
const PLAIN_NOT_FOUND_LINES = [
  /^Network error:$/,
  /^URL: \S.*$/,
  /^Code: \S+$/,
  /^(Error|Reason|Message): Not Found$/i,
];

/**
 * The library writes the error of a node of a page into the message of a new
 * error, as the multi-line text of the original: the title of the node, then
 * the network-error block. True if that text says a plain "not found".
 * @param {string[]} lines the lines after the title of the node
 * @returns {boolean} true if the block is a plain "not found"
 */
function isPlainNotFoundText404(lines: string[]): boolean {
  let statuses = 0;
  for (const line of lines.map((l) => l.trim()).filter(Boolean)) {
    const status = /^Status: (\d+)$/.exec(line);
    if (status) {
      if (status[1] !== '404') return false;
      statuses++;
    } else if (!PLAIN_NOT_FOUND_LINES.some((pattern) => pattern.test(line))) {
      return false;
    }
  }
  return statuses > 0;
}

/**
 * The node that an error of one part of a journey says was not found.
 * @param {Link} item the error
 * @returns {MissingNode | undefined} the node, or undefined if the error says anything else
 */
function missingNodeOf(item: Link): MissingNode | undefined {
  const [title, ...rest] = messageOf(item).split('\n');
  const node = NODE_TITLE.exec(title.trim());
  if (!node) return undefined;
  const plain =
    rest.length > 0
      ? causesOf(item).length === 0 && isPlainNotFoundText404(rest)
      : isPlainNotFound(item);
  return plain ? { type: node[1], id: node[2] } : undefined;
}

/**
 * Whether the error of a journey says only that nodes of it were not found.
 * @param {unknown} error the error that the library reported for one journey of an export
 * @returns {MissingNodes | undefined} the journey and its missing nodes, or undefined if the error is anything else (other statuses, other parts of the journey, another shape): print it in full
 */
export function missingNodesOf(error: unknown): MissingNodes | undefined {
  const top = error as Link;
  const title = JOURNEY_TITLE.exec(messageOf(top).split('\n')[0]);
  if (!title) return undefined;
  let wrapper = top;
  for (;;) {
    const causes = causesOf(wrapper);
    if (
      causes.length === 1 &&
      JOURNEY_WRAPPER.test(messageOf(causes[0]).split('\n')[0])
    ) {
      wrapper = causes[0];
    } else {
      break;
    }
  }
  const items = causesOf(wrapper);
  if (items.length === 0) return undefined;
  const nodes: MissingNode[] = [];
  for (const item of items) {
    const node = missingNodeOf(item);
    if (!node) return undefined;
    nodes.push(node);
  }
  return { realm: title[1], journeyId: title[2], nodes };
}

/**
 * What went wrong with the journey, without its name: the reason in the
 * summary of the failed journeys.
 * @param {MissingNodes} missing the journey and its missing nodes
 * @returns {string} for example "4 of its nodes were not found on the tenant (HTTP 404)"
 */
export function missingNodesReason(missing: MissingNodes): string {
  const count = missing.nodes.length;
  return `${count} of its nodes ${count === 1 ? 'was' : 'were'} not found on the tenant (HTTP 404)`;
}

/**
 * What the summary of the failed journeys calls the journey: the realm and the
 * name, as it does for a journey whose files cannot be written.
 * @param {MissingNodes} missing the journey and its missing nodes
 * @returns {string} for example "alpha/PasswordBreachDetection"
 */
export function missingNodesName(missing: MissingNodes): string {
  return `${missing.realm}/${missing.journeyId}`;
}

/**
 * The one error line for a journey whose nodes were not found.
 * @param {MissingNodes} missing the journey and its missing nodes
 * @returns {string} the journey, the reason and the nodes by type and id
 */
export function missingNodesMessage(missing: MissingNodes): string {
  return `Journey ${missing.journeyId} of the ${missing.realm} realm could not be exported: ${missingNodesReason(missing)}: ${missing.nodes
    .map((node) => `${node.type} ${node.id}`)
    .join(', ')}`;
}
