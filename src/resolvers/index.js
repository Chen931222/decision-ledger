/**
 * Backend for the issue panel. Reads the work item as the current user (so Jira's own permission
 * checks apply), reads the ledger, and returns the conflicts computed by code.
 *
 * The ledger holds decisions from every project. Before showing a decision's text, the resolver
 * checks, as the viewer, that they can open the work item where it was decided. If they cannot,
 * the panel only says that a decision they cannot view applies here.
 */

import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";
import { adfToText } from "../ledger/adf.js";
import { allRows } from "../ledger/store.js";
import { conflicts, inForce, supersededBy } from "../ledger/match.js";
import { verify } from "../ledger/chain.js";

const resolver = new Resolver();

/** True when the current user can open the issue (Jira returns 404 otherwise). */
async function canView(issueKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary`, {
    headers: { Accept: "application/json" },
  });
  return res.ok;
}

/** Only the fields the panel shows. */
const view = (d) => ({ id: d.id, statement: d.statement, createdAt: d.createdAt, sourceIssue: d.sourceIssue, sourceComment: d.sourceComment });

resolver.define("getPanel", async ({ context }) => {
  const issueKey = context.extension.issue.key;
  const res = await api.asUser().requestJira(
    route`/rest/api/3/issue/${issueKey}?fields=summary,description,components,labels,project`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return { error: `Could not read ${issueKey} (${res.status}).` };
  const issue = await res.json();
  const f = issue.fields;
  const item = {
    key: issueKey,
    projectKey: f.project.key,
    text: `${f.summary ?? ""}\n${adfToText(f.description)}`,
    components: (f.components ?? []).map((c) => c.name),
    labels: f.labels ?? [],
  };

  const rows = await allRows();
  const hits = conflicts(rows, item);
  const visible = await Promise.all(hits.map(({ decision }) => canView(decision.sourceIssue)));
  return {
    issueKey,
    conflicts: hits.map(({ decision, term }, i) =>
      visible[i] ? { ...view(decision), term, restricted: false } : { id: decision.id, restricted: true },
    ),
    // Decisions made on this work item: the user is viewing it, so they may see these.
    madeHere: rows
      .filter((r) => r.sourceIssue === issueKey)
      .map((r) => ({ ...view(r), supersededBy: supersededBy(rows, r.id)?.id ?? null })),
    inForceInProject: inForce(rows).filter((r) => r.projectKey === item.projectKey).length,
    chain: verify(rows),
  };
});

export const handler = resolver.getDefinitions();
