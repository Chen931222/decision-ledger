/**
 * Event trigger: a Jira comment that starts with "Decision:" is recorded in the ledger,
 * and the app replies on the issue with the new decision's id.
 *
 * The comment event fires on create and on edit. Edits do not change a recorded decision (the
 * ledger is append-only); the source_comment UNIQUE column makes a repeat event a no-op.
 */

import api, { route } from "@forge/api";
import { adfToText } from "./ledger/adf.js";
import { parseDecision } from "./ledger/parse.js";
import { allRows, append } from "./ledger/store.js";
import { inForce } from "./ledger/match.js";

/** Plain-text reply in Atlassian Document Format. */
function adfParagraphs(lines) {
  return {
    type: "doc",
    version: 1,
    content: lines.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })),
  };
}

async function reply(issueKey, lines) {
  await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ body: adfParagraphs(lines) }),
  });
}

export async function onComment(event) {
  const issueKey = event?.issue?.key;
  const commentId = event?.comment?.id;
  if (!issueKey || !commentId) return;

  // Read the comment from the REST API rather than trusting the event body's shape.
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment/${commentId}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    console.error("Could not read comment", issueKey, commentId, res.status);
    return;
  }
  const comment = await res.json();
  const parsed = parseDecision(adfToText(comment.body));
  if (!parsed) return;

  const projectKey = issueKey.split("-")[0];
  const rows = await allRows();
  let note = null;
  if (parsed.supersedes) {
    // Only a decision that exists and is still in force can be superseded.
    const target = rows.find((r) => r.id === parsed.supersedes);
    if (!target) {
      note = `Supersedes ${parsed.supersedes} was ignored: there is no such decision.`;
      parsed.supersedes = null;
    } else if (!inForce(rows).some((r) => r.id === target.id)) {
      note = `Supersedes ${parsed.supersedes} was ignored: it was already superseded.`;
      parsed.supersedes = null;
    }
  }

  const row = await append({
    projectKey,
    statement: parsed.statement,
    avoid: parsed.avoid,
    scope: parsed.scope,
    supersedes: parsed.supersedes,
    sourceIssue: issueKey,
    sourceComment: String(commentId),
    author: comment.author?.accountId ?? "unknown",
    createdAt: comment.created ?? new Date().toISOString(),
  });
  if (!row) return; // already recorded

  const lines = [`Recorded as ${row.id} in the Decision Ledger.`];
  if (row.avoid.length) lines.push(`New work items in ${projectKey} that mention ${row.avoid.join(", ")} will be flagged.`);
  if (row.supersedes) lines.push(`${row.supersedes} is no longer in force.`);
  if (note) lines.push(note);
  await reply(issueKey, lines);
}
