/**
 * Backend for the issue panel. Reads the work item as the current user (so Jira's own permission
 * checks apply), reads the ledger, and returns the conflicts computed by code.
 */

import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";
import { adfToText } from "../ledger/adf.js";
import { allRows } from "../ledger/store.js";
import { conflicts, inForce, supersededBy } from "../ledger/match.js";
import { verify } from "../ledger/chain.js";

const resolver = new Resolver();

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
  const forced = inForce(rows);
  return {
    issueKey,
    conflicts: conflicts(rows, item).map(({ decision, term }) => ({ ...decision, term })),
    madeHere: rows
      .filter((r) => r.sourceIssue === issueKey)
      .map((r) => ({ ...r, supersededBy: supersededBy(rows, r.id)?.id ?? null })),
    inForceInProject: forced.filter((r) => r.projectKey === item.projectKey).length,
    chain: verify(rows),
  };
});

export const handler = resolver.getDefinitions();
