/**
 * Backend for the Decision Ledger page (a Jira global page): the list of decisions the viewer may
 * see, whether each is in force or superseded and by what, the hash-chain check, and the
 * "Load demo project" action.
 */

import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";
import { allRows } from "./ledger/store.js";
import { supersededBy } from "./ledger/match.js";
import { verify } from "./ledger/chain.js";
import { listProjects, loadDemo } from "./demo.js";

const resolver = new Resolver();

/** Projects the viewer can browse, checked as the viewer and cached per request. */
async function visibleProjects(keys) {
  const out = new Set();
  await Promise.all(
    [...new Set(keys)].map(async (key) => {
      const res = await api.asUser().requestJira(route`/rest/api/3/project/${key}`, { headers: { Accept: "application/json" } });
      if (res.ok) out.add(key);
    }),
  );
  return out;
}

resolver.define("getLedger", async () => {
  const rows = await allRows();
  const visible = await visibleProjects(rows.map((r) => r.projectKey));
  const shown = rows
    .filter((r) => visible.has(r.projectKey))
    .map((r) => ({
      id: r.id,
      projectKey: r.projectKey,
      statement: r.statement,
      avoid: r.avoid,
      supersedes: r.supersedes,
      supersededBy: supersededBy(rows, r.id)?.id ?? null,
      sourceIssue: r.sourceIssue,
      sourceComment: r.sourceComment,
      createdAt: r.createdAt,
    }))
    .reverse(); // newest first
  return { rows: shown, hidden: rows.length - shown.length, chain: verify(rows) };
});

resolver.define("listProjects", async () => listProjects());

resolver.define("loadDemo", async ({ payload, context }) => {
  try {
    return await loadDemo(payload?.projectKey, context.accountId);
  } catch (err) {
    // When the user has not yet granted the app access to act as them, Forge raises an
    // authentication error and shows an "Allow access" prompt, but only if the error propagates.
    const text = String(err?.message ?? err);
    if (err?.name === "NEEDS_AUTHENTICATION_ERR" || err?.code === "NEEDS_AUTHENTICATION_ERR" || /authentication required/i.test(text)) throw err;
    return { error: text };
  }
});

export const handler = resolver.getDefinitions();
