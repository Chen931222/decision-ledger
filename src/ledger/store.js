/**
 * Ledger storage in Forge SQL.
 *
 * There is an INSERT and a SELECT, and nothing else: no UPDATE, no DELETE. "Superseding" a
 * decision is a new row that points at the old one. The hash columns make edits made outside the
 * app detectable (see chain.js).
 */

import { sql, migrationRunner } from "@forge/sql";
import { link } from "./chain.js";

const CREATE = `CREATE TABLE IF NOT EXISTS ledger (
  seq INT AUTO_INCREMENT PRIMARY KEY,
  id VARCHAR(16) NOT NULL UNIQUE,
  project_key VARCHAR(32) NOT NULL,
  statement TEXT NOT NULL,
  avoid TEXT NOT NULL,
  scope TEXT NOT NULL,
  supersedes VARCHAR(16) NULL,
  source_issue VARCHAR(32) NOT NULL,
  source_comment VARCHAR(32) NOT NULL UNIQUE,
  author VARCHAR(128) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  prev_hash CHAR(64) NOT NULL,
  hash CHAR(64) NOT NULL UNIQUE
)`;

let schemaReady = null;

/** Applies migrations once per function instance; migrationRunner skips ones already applied. */
export function ensureSchema() {
  schemaReady ??= migrationRunner.enqueue("v001_create_ledger", CREATE).run();
  return schemaReady;
}

/** Database row -> the shape chain.js and match.js work with. */
function fromDb(r) {
  return {
    id: r.id,
    projectKey: r.project_key,
    statement: r.statement,
    avoid: JSON.parse(r.avoid),
    scope: JSON.parse(r.scope),
    supersedes: r.supersedes,
    sourceIssue: r.source_issue,
    sourceComment: r.source_comment,
    author: r.author,
    createdAt: r.created_at,
    prevHash: r.prev_hash,
    hash: r.hash,
  };
}

/** Every row, in the order it was written. */
export async function allRows() {
  await ensureSchema();
  const res = await sql.prepare("SELECT * FROM ledger ORDER BY seq ASC").execute();
  return res.rows.map(fromDb);
}

/**
 * Appends a decision. The id (DL-n) and both hashes are assigned here.
 * The UNIQUE constraints mean two simultaneous writes cannot both take the same id or the same
 * previous hash; the loser retries on the new tail.
 */
export async function append(entry) {
  // No personal data: who wrote a decision is visible on its source comment in Jira, so the ledger
  // does not keep account ids. Rows are append-only and could never honour a deletion request.
  entry = { ...entry, author: "" };
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = await allRows();
    const last = rows[rows.length - 1];
    const row = link({ ...entry, id: `DL-${rows.length + 1}` }, last);
    try {
      await sql
        .prepare(
          `INSERT INTO ledger (id, project_key, statement, avoid, scope, supersedes, source_issue, source_comment, author, created_at, prev_hash, hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bindParams(
          row.id, row.projectKey, row.statement, JSON.stringify(row.avoid), JSON.stringify(row.scope),
          row.supersedes, row.sourceIssue, row.sourceComment, row.author, row.createdAt, row.prevHash, row.hash,
        )
        .execute();
      return row;
    } catch (err) {
      // A duplicate source comment means this comment was already recorded (events can repeat).
      if (String(err?.message ?? err).includes("source_comment")) return null;
      if (attempt === 2) throw err;
    }
  }
  return null;
}
