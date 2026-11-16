/**
 * Rovo agent actions. Both are read-only (actionVerb GET) and both answers are computed by code
 * from the ledger; Rovo only turns the returned JSON into a sentence. The agent never decides
 * whether something conflicts.
 *
 * Visibility: inputs are not trusted for authorization. Before returning a decision's text, each
 * action checks as the asking user that they can open the work item the decision came from.
 */

import api, { route } from "@forge/api";
import { allRows } from "./ledger/store.js";
import { conflicts, inForce, supersededBy } from "./ledger/match.js";
import { verify } from "./ledger/chain.js";

async function canView(issueKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary`, {
    headers: { Accept: "application/json" },
  });
  return res.ok;
}

const describe = (rows, d) => ({
  id: d.id,
  statement: d.statement,
  avoid: d.avoid,
  project: d.projectKey,
  decidedOn: String(d.createdAt).slice(0, 10),
  status: supersededBy(rows, d.id) ? `superseded by ${supersededBy(rows, d.id).id}` : "in force",
  replaces: d.supersedes,
  source: d.sourceIssue,
});

/** "What is DL-3 and is it still in force?" */
export async function explainDecision(payload) {
  const id = String(payload?.decisionId ?? "").toUpperCase().match(/DL-\d+/)?.[0];
  if (!id) return { error: "Give a decision id like DL-3." };
  const rows = await allRows();
  const d = rows.find((r) => r.id === id);
  if (!d || !(await canView(d.sourceIssue))) return { error: `No decision ${id} that you can view.` };
  return { decision: describe(rows, d), ledger: verify(rows).ok ? "hash chain verified" : "hash chain check FAILED" };
}

/** "We want to cache refund sessions in MongoDB in PAY. Does that go against a decision?" */
export async function checkProposal(payload) {
  const projectKey = String(payload?.projectKey ?? "").toUpperCase().trim();
  const proposal = String(payload?.proposal ?? "");
  if (!projectKey || !proposal) return { error: "Give a project key and a short description of the proposal." };
  const rows = await allRows();
  const hits = conflicts(rows, { key: "(proposal)", projectKey, text: proposal });
  const visible = await Promise.all(hits.map(({ decision }) => canView(decision.sourceIssue)));
  const shown = hits.filter((_, i) => visible[i]);
  return {
    projectKey,
    decisionsInForce: inForce(rows).filter((r) => r.projectKey === projectKey).length,
    conflicts: shown.map(({ decision, term }) => ({ ...describe(rows, decision), matchedTerm: term })),
    hiddenConflicts: hits.length - shown.length,
    note: "Conflicts are found by matching the decisions' Avoid terms, by code. A proposal can still go against the spirit of a decision without using those words.",
  };
}
