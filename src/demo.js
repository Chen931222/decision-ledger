/**
 * "Load demo": adds a short decision history to a project the user picks, so someone who has just
 * installed the app (a judge, say) sees a conflict warning within a minute.
 *
 * The app does not create projects (that would need a Jira-admin permission). Before writing
 * anything, it checks as the clicking user that they may create work items and add comments in
 * the chosen project; then the app itself creates three work items and two decision comments,
 * each marked as demo content. The decisions go into the ledger right away, the same way the
 * comment trigger would.
 */

import api, { route } from "@forge/api";
import { append, allRows } from "./ledger/store.js";
import { parseDecision } from "./ledger/parse.js";
import { checkSupersede } from "./ledger/match.js";

const DEMO_TAG = "[Decision Ledger demo]";

const doc = (...paras) => ({
  type: "doc",
  version: 1,
  content: paras.map((p) => ({
    type: "paragraph",
    content: p.split(String.fromCharCode(10)).flatMap((line, i) => (i ? [{ type: "hardBreak" }, { type: "text", text: line }] : [{ type: "text", text: line }])),
  })),
});

async function call(as, path, method = "GET", body) {
  const res = await as.requestJira(path, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, json: text ? JSON.parse(text) : null };
}

/**
 * Projects the user can browse, for the picker. Jira Product Discovery projects are left out: their
 * idea view does not show issue panels, so the conflict warning would never appear there.
 */
export async function listProjects() {
  const res = await call(api.asUser(), route`/rest/api/3/project/search?maxResults=50`);
  return (res.json?.values ?? []).filter((p) => p.projectTypeKey !== "product_discovery").map((p) => ({ key: p.key, name: p.name }));
}

/** Checks, as the user, that they may create work items and comment in the project. */
async function userMayWrite(projectKey) {
  const res = await call(api.asUser(), route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=CREATE_ISSUES,ADD_COMMENTS`);
  const p = res.json?.permissions ?? {};
  return Boolean(p.CREATE_ISSUES?.havePermission && p.ADD_COMMENTS?.havePermission);
}

async function taskTypeId(projectKey) {
  const res = await call(api.asApp(), route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  const types = res.json?.issueTypes ?? res.json?.values ?? [];
  const task = types.find((t) => !t.subtask && t.hierarchyLevel === 0) ?? types.find((t) => !t.subtask);
  if (!task) throw new Error(`No usable work item type in ${projectKey}.`);
  return task.id;
}

async function createIssue(projectKey, typeId, summary, description) {
  const res = await call(api.asApp(), route`/rest/api/3/issue`, "POST", {
    fields: { project: { key: projectKey }, issuetype: { id: typeId }, summary: `${DEMO_TAG} ${summary}`, description: doc(description) },
  });
  if (!res.ok) throw new Error(`Could not create a work item in ${projectKey} (${res.status}).`);
  return res.json.key;
}

/** Posts a decision comment (as the app, marked as demo) and records it in the ledger now. */
async function decide(projectKey, issueKey, text) {
  const res = await call(api.asApp(), route`/rest/api/3/issue/${issueKey}/comment`, "POST", { body: doc(text) });
  if (!res.ok) throw new Error(`Could not comment on ${issueKey} (${res.status}).`);
  const parsed = parseDecision(text);
  if (parsed.supersedes && !checkSupersede(await allRows(), parsed.supersedes, projectKey).ok) parsed.supersedes = null;
  return append({
    projectKey,
    statement: parsed.statement,
    avoid: parsed.avoid,
    scope: parsed.scope,
    supersedes: parsed.supersedes,
    sourceIssue: issueKey,
    sourceComment: String(res.json.id),
    createdAt: res.json.created ?? new Date().toISOString(),
  });
}

export async function loadDemo(projectKey) {
  if (!projectKey) throw new Error("Pick a project first.");
  let step = "checking your permissions";
  try {
    if (!(await userMayWrite(projectKey))) throw new Error(`You need permission to create work items and comment in ${projectKey}.`);
    step = "reading work item types";
    const typeId = await taskTypeId(projectKey);
    step = "creating demo work items";
    return await createDemo(projectKey, typeId);
  } catch (err) {
    console.error(`loadDemo failed while ${step}:`, err?.name, err?.message ?? err);
    if (!(err instanceof Error)) throw new Error(`${err} (while ${step})`);
    err.message = `${err.message} (while ${step})`;
    throw err;
  }
}

async function createDemo(projectKey, typeId) {

  // First the team picks MongoDB.
  const first = await createIssue(projectKey, typeId, "Pick a datastore for the payments ledger", "Payment events need to be stored and replayed.");
  const d1 = await decide(projectKey, first, `Decision: Use MongoDB for payment events.
Avoid: DynamoDB`);

  // After an incident they switch to PostgreSQL and supersede the first decision.
  const second = await createIssue(projectKey, typeId, "Post-incident: double-charged refunds", "Two refunds were applied twice because writes across accounts were not atomic.");
  const d2 = await decide(
    projectKey,
    second,
    `Decision: Use PostgreSQL for all payment data. Transfers between accounts must be atomic.
Avoid: MongoDB, DynamoDB
Supersedes: ${d1.id}`,
  );

  // Weeks later, someone who missed the incident proposes the old approach again.
  const third = await createIssue(projectKey, typeId, "Cache refund sessions in MongoDB", "Quick prototype: keep refund session state in a MongoDB collection so the refund page loads faster.");

  return {
    message: `Added to ${projectKey}: ${first} (${d1.id}, superseded), ${second} (${d2.id}, in force), ${third} (conflicts with ${d2.id}).`,
    conflictIssue: third,
  };
}
