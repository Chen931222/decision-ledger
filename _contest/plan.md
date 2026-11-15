# Decision Ledger for Jira: scoped plan (2026-11-14)

Deadline: 2026-12-22 12:00 PST (Taiwan 12/23 04:00). Real working time about 2.5–3 weeks (AI CUP until 12/4).
Category: Apps for Software Teams. Bonus: Best Agents (rovo:agent). Teamwork Graph dropped (connector is likely early-access; not confirmed for free sites). Marketplace only if time is left.

## One line
Teams stop redoing work that contradicts a decision they already made: decisions are registered from Jira comments, kept as an append-only, hash-chained ledger with "supersedes" links, and a new work item that contradicts a decision still in force shows a warning that cites the source.

## What the model is and is not trusted with (same lesson as Campus Lens)
- Code decides whether a decision is in force (status, supersedes chain) and whether a new issue hits it: each decision carries a scope (project, component/label) and plain "do / don't" terms; matching is deterministic and explainable.
- Rovo (if available) explains and answers "why did we decide this, is it still in force?" from the ledger via a GET action. It never decides.
- No Forge LLM module: it is billed per token to the developer.

## Build order
1. Ledger core: register a decision from a Jira comment that starts with `Decision:` (trigger `avi:jira:commented:issue`), store in Forge SQL (append-only by code: no UPDATE/DELETE path; supersede = new row pointing at old), hash chain over rows. Verify endpoint recomputes the chain.
2. Check: on `avi:jira:created:issue` / `avi:jira:updated:issue`, match the new issue against decisions in force for its project/component; store hits.
3. UI: `jira:issuePanel` (UI Kit) shows "This work item conflicts with decision D-12 (in force since …, by …)" with a link to the source comment; `jira:issueContext` badge. Ledger page (`jira:projectPage`) with timeline and supersedes.
4. "Load demo project" button: seeds a project with a short history (decision, superseded decision, later work items) so a judge sees a warning within a minute of installing.
5. Rovo agent + GET action `explainDecision` (test on a demo site first; the free dev site may not have Rovo).
6. Video (< 5 min), Devpost write-up, install link (Developer console → Distribution → Sharing).

## Risks
- Rovo may be missing on the free developer site → test `forge site provision` demo site; issue panel works without Rovo.
- Trigger events can take up to 3 minutes → the panel also checks on open.
- Warning cannot appear on the create screen (not confirmed) → it appears on the issue view right after creation.

## Needs the owner
- Atlassian account (owner creates). Developer site: AI creates in owner's Chrome with owner's go-ahead. API token + `forge login`: owner types it (credential).
