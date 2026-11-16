# Decision Ledger for Jira

A team decides "no MongoDB for payment data" after an incident. Six weeks later someone who missed the incident opens a work item to cache refund sessions in MongoDB. Nobody remembers the decision, or where it was written down.

Decision Ledger keeps those decisions where the work happens. A comment that starts with `Decision:` is recorded in an append-only ledger. A later work item that mentions something a decision in force says to avoid gets a warning on the work item, with a link to the comment where the decision was made.

Built with Atlassian Forge for Codegeist 2026.

## How a decision is written

A plain Jira comment. The first line must start with `Decision:`; the other lines are optional.

```
Decision: Use PostgreSQL for all payment data. Transfers between accounts must be atomic.
Avoid: MongoDB, DynamoDB
Scope: component=backend
Supersedes: DL-2
```

- `Avoid` lists the terms a later work item is checked against.
- `Scope` narrows the check to work items with that component or label. Without it, the whole project is checked.
- `Supersedes` replaces an earlier decision in the same project. The old record stays; it is shown as "superseded by DL-3".

The app replies to the comment with the id it recorded (`DL-3`).

## What you see

- **On a work item**: a "Decision Ledger" panel. If the work item mentions an avoided term of a decision in force, it says which decision, since when, which term matched, and links to the source comment.
- **Decision Ledger page** (Apps menu): every decision you are allowed to see, newest first, with its status and a hash-chain check of the whole ledger. A "Load demo" button adds a short history to a project you pick: two decisions, the second replacing the first, and a later work item that conflicts. Demo work items are titled `[Decision Ledger demo]`.
- **Rovo agent** "Decision Ledger" (on sites with Rovo): ask "Is DL-3 still in force?" or "Can PAY cache refund sessions in MongoDB?".

## What code decides, and what the model does

Whether a comment is a decision, whether a decision is in force, and whether a work item conflicts with it are all decided by code, the same way every time:

- Matching is whole-word and case-insensitive: `Mongo` does not match `MongoDB`.
- A decision applies only inside its own project, and inside its scope if it has one.
- `Supersedes` works only for an existing decision, still in force, in the same project.

The Rovo agent calls two read-only actions that return what the code computed. Its instructions say to report those results and not to judge conflicts itself. The app uses no LLM of its own.

## Why the ledger can be trusted

- Rows are only ever inserted. There is no update or delete path in the code.
- Each row stores the sha256 hash of its content plus the previous row's hash. The page recomputes the chain on every load and says where it breaks if a row was changed.
- The database enforces unique ids, unique source comments and unique hashes, so a repeated event cannot record the same comment twice.

## Who sees what

Every check runs as the person looking:

- The panel, the ledger page and the Rovo actions show a decision only if that person can open the work item it came from. Jira issue security can hide single work items inside a visible project, so this is checked per work item, not per project.
- Comments restricted to a group or role, and internal service-desk comments, are not recorded.
- The Rovo proposal check needs access to the project first, and counts only decisions the person can see.

## Limits

- Matching only knows the words in `Avoid`. A proposal can go against the spirit of a decision without using them; the panel and the agent say so.
- The warning appears on the work item view after creation, not on the create screen.
- Comment events can take a few minutes to arrive. The panel also checks when it opens.
- On a work item the panel has to be added once from the work item's Apps menu.
- Jira Product Discovery projects are not offered for the demo: their idea view does not show issue panels.
- Not tested with real teams. Tested on one developer site and one Atlassian demo site.

## Privacy

The ledger stores the decision text, the project, the work item key and the comment id. It does not store who wrote the decision; Jira shows that on the source comment. See [PRIVACY.md](PRIVACY.md).

## Run it yourself

Requires Node 20.18+ and the Forge CLI ([set up Forge](https://developer.atlassian.com/platform/forge/set-up-forge/)).

```
npm install
npm test
forge register
forge deploy
forge install
```

`npm test` runs 14 tests, including property-based tests (fast-check) for the parser, the matcher and the hash chain.

## Layout

```
manifest.yml            modules, trigger, Rovo agent and actions, scopes
src/ledger/parse.js     comment -> decision
src/ledger/match.js     in force, supersedes, conflicts
src/ledger/chain.js     sha256 hash chain and verification
src/ledger/store.js     Forge SQL, insert and select only
src/triggers.js         records decisions from new comments
src/resolvers/index.js  issue panel backend
src/page-resolver.js    ledger page backend
src/demo.js             "Load demo"
src/rovo.js             Rovo actions
src/prompts/prompt.md   Rovo agent instructions
```

## License

Apache-2.0
