import { frodo, type JourneyReference } from '@rockcarver/frodo-lib';
import {
  clearingError,
  describeFields,
  differences,
  jsonCopy,
  reasonOf,
} from './ReferenceDelete';

// stays exported from here: the tests of this module import it from this file
export { unreadableSources } from './ReferenceDelete';

/**
 * What `config-manager delete journeys --force` does for each holder that still
 * names the journey: the one table of the command (`HOLDER_RULES`), the pure
 * functions that plan the delete and word it, and the writes that clear a
 * holder or remove the journey from a theme.
 *
 * The lookup itself (`findJourneyReferences`) is a library function. Clearing
 * and unlinking compose library functions that read and update the holder, so
 * they live here and not in the library (the library holds the common
 * functions and the CLI composes them:
 * https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0036-the-library-holds-common-functions-and-the-cli-composes-them.md).
 *
 * The library values are read through `frodo` when a function runs, never at
 * module level: many tests replace the library by a stub that has no such
 * namespace.
 */

type Source = JourneyReference['source'];

/** The placeholder that Access Management uses for "no journey" in a field that names one. */
export const NO_JOURNEY = '[Empty]';

/**
 * What `--force` does about a holder:
 * - `clear`: Access Management refuses to delete a journey that the holder names
 *   (OAuth2 clients and SAML providers), or the holder cannot be updated or
 *   deleted once the journey is gone (AI agents). The journey name in the exact
 *   field is replaced by the placeholder, before the journey is deleted.
 * - `unlink`: the journey is removed from the list of journeys of the holder
 *   (themes), unless `--keep-links` was given.
 * - `leave`: Access Management lets the delete through, or the holder was never
 *   seen to behave otherwise: the holder is reported and nothing of it is
 *   changed, so it points at nothing afterwards.
 */
export type HolderAction = 'clear' | 'unlink' | 'leave';

/** How the field of a holder holds the journey name, when its reference is cleared. */
export type HolderRule = {
  action: HolderAction;
  /** What the holder is called in a message. */
  holder: string;
  /** `clear` only: the field is `{ inherited, value }` (`wrapped`) or the name itself (`plain`). */
  shape?: 'wrapped' | 'plain';
};

/**
 * The table: one row for every `source` of `findJourneyReferences`. A new source
 * of the library is a compile error until it has a row here. AI agents, agent
 * groups and CIMD profiles are as observed: an AI agent is cleared, the others
 * were never observed to refuse and are left alone.
 */
export const HOLDER_RULES: Record<Source, HolderRule> = {
  journey: { action: 'leave', holder: 'journey' },
  'authentication-settings': {
    action: 'leave',
    holder: 'authentication settings',
  },
  'self-service-trees': {
    action: 'leave',
    holder: 'self-service journey settings',
  },
  'oauth2-provider': { action: 'leave', holder: 'OAuth2 provider settings' },
  'oauth2-client': {
    action: 'clear',
    holder: 'OAuth2 client',
    shape: 'wrapped',
  },
  'saml2-provider': {
    action: 'clear',
    holder: 'SAML provider',
    shape: 'plain',
  },
  'ai-agent': {
    action: 'clear',
    holder: 'AI agent',
    shape: 'wrapped',
  },
  'agent-group': { action: 'leave', holder: 'agent group' },
  'cimd-profile': { action: 'leave', holder: 'CIMD profile' },
  theme: { action: 'unlink', holder: 'theme' },
  policy: { action: 'leave', holder: 'policy' },
};

/** The references of the objects that hold the name in a field of their own and have an id. */
type HolderReference = Extract<JourneyReference, { id: string }>;
/** The references of the holders whose journey name `--force` replaces by the placeholder. */
export type ClearableReference = HolderReference & {
  source: 'oauth2-client' | 'saml2-provider' | 'ai-agent';
};
/** The references of the themes that link the journey. */
export type ThemeReference = HolderReference & { source: 'theme' };

/** What a delete of a named journey does for every reference that was found. */
export type JourneyDeletePlan = {
  /** Holders whose reference is cleared before the journey is deleted. */
  clear: ClearableReference[];
  /** Themes that link the journey and are changed. */
  removeLinks: ThemeReference[];
  /** Themes that link the journey and are not changed (`--keep-links`). */
  kept: ThemeReference[];
  /** Holders that are reported and not changed: they point at nothing afterwards. */
  dangling: JourneyReference[];
};

/**
 * Plans what `--force` does with the references of a journey, by the table.
 * Pure: nothing is read or written.
 * @param {JourneyReference[]} references what names the journey
 * @param {object} options the options of the command
 * @param {boolean} options.keepLinks true to leave the links of the themes as they are
 * @returns {JourneyDeletePlan} the plan
 */
export function planJourneyDelete(
  references: JourneyReference[],
  { keepLinks = false }: { keepLinks?: boolean } = {}
): JourneyDeletePlan {
  const plan: JourneyDeletePlan = {
    clear: [],
    removeLinks: [],
    kept: [],
    dangling: [],
  };
  for (const reference of references) {
    const { action } = HOLDER_RULES[reference.source];
    // a holder that only inherits the name has nothing of its own to clear: the
    // group that holds the value is reported as well
    const inherited = 'inherited' in reference && reference.inherited === true;
    if (action === 'clear' && !inherited) {
      plan.clear.push(reference as ClearableReference);
    } else if (action === 'unlink') {
      (keepLinks ? plan.kept : plan.removeLinks).push(
        reference as ThemeReference
      );
    } else {
      plan.dangling.push(reference);
    }
  }
  return plan;
}

/**
 * The words for one holder, for a message: what it is, its name, and the field
 * that holds the journey name.
 * @param {JourneyReference} reference the reference
 * @returns {string} for example `OAuth2 client 'zion-client' (advancedOAuth2ClientConfig.treeName)`
 */
export function describeReference(reference: JourneyReference): string {
  const { holder } = HOLDER_RULES[reference.source];
  switch (reference.source) {
    case 'journey': {
      const node = reference.nodeDisplayName
        ? `${reference.nodeDisplayName}, ${reference.nodeType} node ${reference.nodeId}`
        : `${reference.nodeType} node ${reference.nodeId}`;
      return `${holder} '${reference.journeyId}' (${node})`;
    }
    case 'authentication-settings':
    case 'self-service-trees':
    case 'oauth2-provider':
      return `${holder} (${reference.from})`;
    case 'theme':
      return `${holder} '${reference.name ?? reference.id}' (${reference.from})`;
    case 'policy':
      return `${holder} '${reference.name ?? reference.id}' of policy set '${reference.applicationName}' (${reference.from})`;
    default:
      return `${holder} '${reference.id}' (${reference.from}${reference.inherited ? ', inherited from its group' : ''})`;
  }
}

/**
 * One line for a reference, with the library's flag of how much the holder
 * depends on the journey.
 * @param {JourneyReference} reference the reference
 * @returns {string} the line, without indentation
 */
export function referenceLine(reference: JourneyReference): string {
  return `${describeReference(reference)}, ${reference.dependency}`;
}

/** The field of a holder as a list of keys: `a.b.c` is `['a', 'b', 'c']`. */
const pathOf = (from: string): string[] => from.split('.');

/**
 * The journey name that a holder holds in a field.
 * @param {unknown} data the holder as the library returned it
 * @param {string} from the dotted path of the field
 * @param {'wrapped' | 'plain'} shape how the field holds the name
 * @returns {unknown} the value, or undefined when the field is not there
 */
export function journeyNameAt(
  data: unknown,
  from: string,
  shape: 'wrapped' | 'plain'
): unknown {
  let node: unknown = data;
  for (const key of pathOf(from)) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return shape === 'wrapped'
    ? (node as { value?: unknown } | undefined)?.value
    : node;
}

/** The value that clears a field: the placeholder, in the shape of the field. */
function clearedValue(shape: 'wrapped' | 'plain'): unknown {
  return shape === 'wrapped'
    ? { inherited: false, value: NO_JOURNEY }
    : NO_JOURNEY;
}

/**
 * Puts the placeholder into the field of a holder, in place, and leaves
 * everything else as it is.
 * @param {Record<string, unknown>} data the holder as the library returned it
 * @param {string} from the dotted path of the field
 * @param {'wrapped' | 'plain'} shape how the field holds the name
 * @returns {Record<string, unknown>} the same object
 */
export function setJourneyCleared(
  data: Record<string, unknown>,
  from: string,
  shape: 'wrapped' | 'plain'
): Record<string, unknown> {
  const keys = pathOf(from);
  let node = data;
  for (const key of keys.slice(0, -1)) {
    node = node[key] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = clearedValue(shape);
  return data;
}

/** What a clearing or an unlinking changed, for the message after it. */
export type HolderChange = {
  /** The old value of the field: the journey name, or the list of journeys of a theme. */
  was: string;
};

/**
 * Clears the reference of one holder: reads it, checks that the field still
 * names the journey, writes the whole holder back with the placeholder in that
 * one field (the way the clearing was observed to be accepted), reads it again
 * and checks that the field holds the placeholder and that nothing else changed.
 * If anything else changed (a write that replaces what it is not sent, or
 * normalises it), the holder is written back as it was before, and the error
 * says what had changed and whether the restore worked; the journey is not
 * deleted after that. The provider of a SAML holder is written to the location
 * that the library's stub of that provider names (`hosted` or `remote`): the
 * read of the provider itself does not say it.
 * @param {ClearableReference} reference the reference found by the library
 * @param {string} journeyId the journey that is about to be deleted
 * @returns {Promise<HolderChange>} what was cleared
 * @throws {import('./ReferenceDelete').ClearingError} when the holder does not name the journey any more,
 * when a library function fails, or when the holder does not read back as it
 * should. `holderChanged` on the error says that the holder was written and
 * may differ from what it was (a read after the write failed, or the restore
 * did not work), so the caller can say what stays changed.
 */
export async function clearJourneyReference(
  reference: ClearableReference,
  journeyId: string
): Promise<HolderChange> {
  const rule = HOLDER_RULES[reference.source];
  const shape = rule.shape ?? 'plain';
  const { from, id } = reference;
  const label = describeReference(reference);

  const read = async (): Promise<Record<string, unknown>> => {
    switch (reference.source) {
      case 'oauth2-client':
        return (await frodo.oauth2oidc.client.readOAuth2Client(
          id
        )) as unknown as Record<string, unknown>;
      case 'saml2-provider':
        return (await frodo.saml2.entityProvider.readSaml2Provider(
          id
        )) as unknown as Record<string, unknown>;
      default:
        return (await frodo.agent.readAIAgent(id, false)) as unknown as Record<
          string,
          unknown
        >;
    }
  };
  // a SAML provider is written to `hosted` or to `remote`: ask which
  const location =
    reference.source === 'saml2-provider'
      ? (await frodo.saml2.entityProvider.readSaml2ProviderStub(id)).location
      : undefined;
  const write = async (data: Record<string, unknown>): Promise<void> => {
    const body = jsonCopy(data);
    switch (reference.source) {
      case 'oauth2-client':
        await frodo.oauth2oidc.client.updateOAuth2Client(id, body as never);
        break;
      case 'saml2-provider':
        // the writes of an import carry no revision either
        delete body['_rev'];
        await frodo.saml2.entityProvider.updateSaml2Provider(
          location as 'hosted' | 'remote',
          body as never
        );
        break;
      default:
        await frodo.agent.updateAIAgent(id, body as never, false);
    }
  };

  const before = await read();
  const was = journeyNameAt(before, from, shape);
  if (was !== journeyId) {
    throw new Error(
      `The ${label} does not name journey '${journeyId}' any more (it holds ${JSON.stringify(was)}): nothing was written.`
    );
  }
  const original = jsonCopy(before);
  await write(setJourneyCleared(jsonCopy(original), from, shape));

  let after: Record<string, unknown>;
  try {
    after = await read();
  } catch (error) {
    // the holder was written and cannot be looked at: it stays as it is
    throw clearingError(
      `The ${label} was written, but it could not be read again to check it (${reasonOf(error)}). It may differ from what it was before.`,
      true
    );
  }
  const expected = setJourneyCleared(jsonCopy(original), from, shape);
  const wrong = differences(expected, after);
  // a difference inside the field is the field itself; one above it (a section
  // that is gone) or anywhere else is damage
  const others = wrong.filter(
    (path) => path !== from && !path.startsWith(`${from}.`)
  );
  if (others.length === 0) {
    if (wrong.length > 0) {
      throw clearingError(
        `The ${label} still holds the journey name after it was cleared.`,
        false
      );
    }
    return { was: journeyId };
  }

  // the write changed more than the field: put the holder back as it was
  const changed = describeFields(others);
  let remaining: string[];
  let problem = '';
  try {
    await write(original);
  } catch (error) {
    problem = `the write failed (${reasonOf(error)})`;
  }
  if (!problem) {
    try {
      remaining = differences(original, await read());
      if (remaining.length > 0) {
        problem =
          'the write was accepted, but the holder still differs from the original';
      }
    } catch (error) {
      problem = `the write was accepted, but the check read after it failed (${reasonOf(error)})`;
      remaining = others;
    }
  } else {
    remaining = others;
  }
  if (!problem) {
    throw clearingError(
      `The ${label} was cleared, but it changed in more than that field: ${changed}. It was written back as it was before, and the journey is not deleted.`,
      false
    );
  }
  // the library does not write an attribute whose name has `-encrypted` in it, so
  // no restore can put such an attribute back
  const lost = remaining.some((path) => path.includes('-encrypted'))
    ? ' The library never writes an attribute whose name has -encrypted in it, so no restore can put it back.'
    : '';
  throw clearingError(
    `The ${label} was cleared, but it changed in more than that field: ${changed}. It could NOT be written back as it was before: ${problem}; it differs from the original in ${describeFields(remaining)}.${lost} The field also stays [Empty]: put the lost attributes back by hand and set the journey '${journeyId}' in the holder again. The journey is not deleted.`,
    true
  );
}

/**
 * Removes the journey from the list of journeys of a theme: reads the theme,
 * writes it without the journey, reads it again and checks that the journey is
 * gone from the list. A theme write rewrites the theme configuration of the
 * whole tenant (the library does that), and that is why the command asks first.
 * @param {ThemeReference} reference the reference found by the library
 * @param {string} journeyId the journey that is about to be deleted
 * @returns {Promise<HolderChange>} what was changed
 * @throws {Error} when the theme does not link the journey any more, when a
 * library function fails, or when the theme does not read back as it should
 */
export async function unlinkJourneyReference(
  reference: ThemeReference,
  journeyId: string
): Promise<HolderChange> {
  const label = describeReference(reference);
  const theme = await frodo.theme.readTheme(reference.id);
  const linked: string[] = Array.isArray(theme.linkedTrees)
    ? theme.linkedTrees
    : [];
  if (!linked.includes(journeyId)) {
    throw new Error(
      `The ${label} does not link journey '${journeyId}' any more: nothing was written.`
    );
  }
  await frodo.theme.updateTheme(reference.id, {
    ...theme,
    linkedTrees: linked.filter((name) => name !== journeyId),
  });
  let after;
  try {
    after = await frodo.theme.readTheme(reference.id);
  } catch (error) {
    // the theme was written and cannot be looked at
    throw clearingError(
      `The ${label} was written, but it could not be read again to check it (${reasonOf(error)}).`,
      true
    );
  }
  if ((after.linkedTrees ?? []).includes(journeyId)) {
    throw new Error(
      `The ${label} still links the journey after it was changed.`
    );
  }
  return { was: linked.join(', ') };
}
