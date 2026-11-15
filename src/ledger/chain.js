/**
 * Hash chain over the ledger rows.
 *
 * Each row's hash covers its own fields and the previous row's hash. Changing, deleting or
 * reordering any earlier row changes every hash after it, so verify() can say exactly where the
 * ledger stops matching. The app never updates or deletes a row: superseding a decision adds a
 * new row that points at the old one.
 *
 * This proves the ledger was not edited after the fact by anyone without the app's code; it does
 * not protect against someone who can rewrite the whole table and recompute every hash. The
 * write-up says so.
 */

import { createHash } from "node:crypto";

export const GENESIS = "0".repeat(64);

/** The fields that are hashed, in a fixed order, so the same row always gives the same hash. */
export function canonical(row) {
  return JSON.stringify([
    row.id,
    row.projectKey,
    row.statement,
    row.avoid ?? [],
    row.scope ?? { components: [], labels: [] },
    row.supersedes ?? null,
    row.sourceIssue,
    row.sourceComment,
    row.author,
    row.createdAt,
  ]);
}

export function hashRow(row, prevHash) {
  return createHash("sha256").update(prevHash + "\n" + canonical(row)).digest("hex");
}

/** Adds prevHash and hash to a new row that will follow `last` (or start the chain). */
export function link(row, last) {
  const prevHash = last ? last.hash : GENESIS;
  return { ...row, prevHash, hash: hashRow(row, prevHash) };
}

/**
 * Checks rows in ledger order.
 * @returns {{ok: true, count: number} | {ok: false, brokenAt: string, reason: string}}
 */
export function verify(rows) {
  let prev = GENESIS;
  for (const row of rows) {
    if (row.prevHash !== prev) return { ok: false, brokenAt: row.id, reason: "links to a different previous row" };
    if (hashRow(row, prev) !== row.hash) return { ok: false, brokenAt: row.id, reason: "content changed after it was recorded" };
    prev = row.hash;
  }
  return { ok: true, count: rows.length };
}
