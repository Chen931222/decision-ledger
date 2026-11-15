/**
 * Which decisions are still in force, and does a work item conflict with any of them.
 *
 * Both answers are computed here, by code, so they are the same every time and can be explained:
 * the panel shows the exact term that matched and the decision it came from. A language model is
 * never asked whether something "conflicts".
 */

/** A decision is in force unless a later decision supersedes it. Returns them newest first. */
export function inForce(rows) {
  const superseded = new Set(rows.map((r) => r.supersedes).filter(Boolean));
  return rows.filter((r) => !superseded.has(r.id)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Who replaced a decision, if anyone. */
export function supersededBy(rows, id) {
  return rows.find((r) => r.supersedes === id) ?? null;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive match; "Mongo" does not match "MongoDB" and vice versa. */
export function mentions(text, term) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

function inScope(decision, item) {
  const { components = [], labels = [] } = decision.scope ?? {};
  if (decision.projectKey !== item.projectKey) return false;
  if (components.length === 0 && labels.length === 0) return true;
  const lc = (xs) => xs.map((x) => x.toLowerCase());
  const itemComponents = lc(item.components ?? []);
  const itemLabels = lc(item.labels ?? []);
  return lc(components).some((c) => itemComponents.includes(c)) || lc(labels).some((l) => itemLabels.includes(l));
}

/**
 * @param {Array} rows every ledger row
 * @param {{key: string, projectKey: string, text: string, components?: string[], labels?: string[]}} item
 * @returns {Array<{decision: object, term: string}>} one entry per conflicting decision
 */
export function conflicts(rows, item) {
  const out = [];
  for (const d of inForce(rows)) {
    if (d.sourceIssue === item.key) continue; // the issue where the decision was made is not a conflict
    if (!inScope(d, item)) continue;
    const term = (d.avoid ?? []).find((t) => mentions(item.text, t));
    if (term) out.push({ decision: d, term });
  }
  return out;
}
