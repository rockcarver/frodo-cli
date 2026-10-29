// The opt-out label of Repo Concierge.
//
// An item that carries `no-auto-processing` is never touched by the Concierge: no gate starts for it, no
// workflow labels, comments on, assigns or closes it, and no script picks it from a query. A maintainer puts
// the label on an item to handle it by hand (an issue that predates the Concierge, or one that needs a
// person's own explanation), and removes it to hand the issue over: removing it starts the issue worker once.
// The rule and the reasons for it: docs/multi-phase-design.md, "Opting an item out", and the decision record
// https://github.com/gearsnlevers/issue-concierge/blob/main/docs/decisions/0028-an-item-labelled-no-auto-processing-is-never-touched.md
//
// The gh-aw workflows and the plain workflows check the label in their `if:` (so no run starts for the event);
// the scripts check it here, for the items they pick by a query or read by number. The two checks name the same
// label, and tools/opt-out.test.mjs keeps them equal.
//
// Install: copy to .github/scripts/opt-out.mjs. The scripts that import it are installed with it.

export const LABEL_OPT_OUT = 'no-auto-processing';

/** The names of an item's labels, whether the API gave objects (`{ name }`) or plain strings. */
export function labelNames(item) {
  return ((item && item.labels) || []).map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
}

/** True when the issue or pull request carries the opt-out label. */
export function isOptedOut(item) {
  return labelNames(item).includes(LABEL_OPT_OUT);
}

/** The one line every script logs when it leaves an item alone because of the label. */
export function optedOutReason(kind = 'item') {
  return `the ${kind} carries ${LABEL_OPT_OUT}: the Concierge does not touch it`;
}
