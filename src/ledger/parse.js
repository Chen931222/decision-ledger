/**
 * Turns a Jira comment into a decision, or null when the comment is not one.
 *
 * A decision is registered by writing a comment that starts with "Decision:".
 * Optional lines refine it. Everything else in the comment is ignored.
 *
 *   Decision: Use PostgreSQL for all new services.
 *   Avoid: MongoDB, DynamoDB
 *   Scope: component=backend
 *   Supersedes: DL-3
 *
 * The format is deliberately plain so a person can read and write it without the app, and so
 * whether something is a decision never depends on a model's judgement.
 */

const FIELD = /^\s*(decision|avoid|scope|supersedes)\s*:\s*(.*)$/i;

/** Splits "MongoDB, DynamoDB; Firebase" into clean, de-duplicated terms. */
export function splitTerms(text) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text).split(/[,;]/)) {
    const term = raw.trim().replace(/\.$/, "");
    const key = term.toLowerCase();
    if (term && !seen.has(key)) {
      seen.add(key);
      out.push(term);
    }
  }
  return out;
}

/** "component=backend, label=payments" -> { components: ["backend"], labels: ["payments"] } */
export function parseScope(text) {
  const scope = { components: [], labels: [] };
  for (const part of String(text).split(/[,;]/)) {
    const m = part.trim().match(/^(component|label)\s*=\s*(.+)$/i);
    if (!m) continue;
    const list = m[1].toLowerCase() === "component" ? scope.components : scope.labels;
    list.push(m[2].trim());
  }
  return scope;
}

/**
 * @param {string} text plain text of the comment
 * @returns {{statement: string, avoid: string[], scope: {components: string[], labels: string[]}, supersedes: string|null} | null}
 */
export function parseDecision(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  // The first non-empty line must be the Decision line; a passing mention later does not count.
  const first = lines.find((l) => l.trim() !== "");
  if (!first || !/^\s*decision\s*:/i.test(first)) return null;

  const result = { statement: "", avoid: [], scope: { components: [], labels: [] }, supersedes: null };
  for (const line of lines) {
    const m = line.match(FIELD);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "decision") result.statement = value;
    else if (field === "avoid") result.avoid.push(...splitTerms(value));
    else if (field === "scope") {
      const s = parseScope(value);
      result.scope.components.push(...s.components);
      result.scope.labels.push(...s.labels);
    } else if (field === "supersedes") {
      const id = value.match(/DL-\d+/i);
      result.supersedes = id ? id[0].toUpperCase() : null;
    }
  }
  if (!result.statement) return null;
  return result;
}
