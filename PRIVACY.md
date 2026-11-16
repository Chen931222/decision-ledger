# Privacy

Decision Ledger for Jira runs entirely on Atlassian Forge. It has no servers of its own and sends nothing outside Atlassian.

## What it stores

In Forge SQL storage, for each decision recorded on your site:

- the decision text, its "Avoid" terms, scope and "Supersedes" reference
- the project key, the work item key and the comment id it came from
- the time of the comment
- two sha256 hashes that chain the records together

It does not store who wrote the decision, or any account ids, email addresses or names. Who wrote a decision is visible on the source comment in Jira, subject to Jira's own permissions.

## What it reads

As the person using it: work items, projects and permissions, to decide what that person may see. As the app: new comments, to record decisions, and, when someone presses "Load demo", the project's work item types.

## What it writes

A reply comment with the recorded id, after a decision comment. When someone presses "Load demo" in a project where they may create work items and comment: three work items titled `[Decision Ledger demo]` and two decision comments.

## Logs

When "Load demo" fails, the app writes one log line with the step that failed and the error message. Logs go to Atlassian's Forge logging, which the developer can read to fix problems. They contain no names or account ids. Site admins can turn off the developer's log access, or view and download the logs, at admin.atlassian.com.

## Deleting data

Records cannot be edited or deleted from inside the app; that is what makes the ledger trustworthy. Uninstalling the app removes its Forge storage according to Atlassian's data retention for Forge apps.

## Contact

Questions: open an issue at https://github.com/Chen931222/decision-ledger/issues
