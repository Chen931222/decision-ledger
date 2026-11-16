/**
 * Decision Ledger page: every decision the viewer may see, newest first, with its status computed
 * by code (in force, or superseded by which decision), and a button that loads a demo project.
 */

import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Stack, Inline, Text, Heading, Button, SectionMessage, Link, Lozenge, Strong, Spinner, DynamicTable, Select,
} from "@forge/react";
import { invoke } from "@forge/bridge";

const day = (iso) => String(iso).slice(0, 10);

function statusCell(r) {
  return r.supersededBy ? (
    <Lozenge appearance="removed">superseded by {r.supersededBy}</Lozenge>
  ) : (
    <Lozenge appearance="success">in force</Lozenge>
  );
}

const head = {
  cells: [
    { key: "id", content: "Decision" },
    { key: "statement", content: "What was decided" },
    { key: "avoid", content: "Avoid" },
    { key: "status", content: "Status" },
    { key: "source", content: "Where" },
  ],
};

function rowsFor(list) {
  return list.map((r) => ({
    key: r.id,
    cells: [
      { key: "id", content: <Text><Strong>{r.id}</Strong>{"\n"}{day(r.createdAt)}</Text> },
      { key: "statement", content: <Text>{r.statement}{r.supersedes ? ` (replaces ${r.supersedes})` : ""}</Text> },
      { key: "avoid", content: <Text>{r.avoid.join(", ") || "—"}</Text> },
      { key: "status", content: statusCell(r) },
      { key: "source", content: <Link href={`/browse/${r.sourceIssue}?focusedCommentId=${r.sourceComment}`}>{r.sourceIssue}</Link> },
    ],
  }));
}

const App = () => {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(null);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);

  const refresh = () => invoke("getLedger").then(setData).catch((e) => setData({ error: String(e?.message ?? e) }));
  useEffect(() => {
    refresh();
    invoke("listProjects").then((list) => setProjects(list.map((p) => ({ label: `${p.name} (${p.key})`, value: p.key })))).catch(() => setProjects([]));
  }, []);

  const onDemo = async () => {
    setBusy(true);
    setDemo(null);
    const res = await invoke("loadDemo", { projectKey: project?.value }).catch((e) => ({ error: String(e?.message ?? e) }));
    setDemo(res);
    setBusy(false);
    refresh();
  };

  return (
    <Stack space="space.200">
      <Heading as="h1">Decision Ledger</Heading>
      <Text>
        Decisions recorded from Jira comments that start with "Decision:". The status column is computed by the app from
        the ledger, not by AI. Records are never edited or deleted; replacing a decision adds a new one.
      </Text>
      <Text>
        Try it: pick a project and load a short demo history: two decisions, the second replacing the first, and a
        later work item that conflicts. Demo work items are titled "[Decision Ledger demo]".
      </Text>
      <Inline space="space.100" alignBlock="center">
        <Select
          inputId="demo-project"
          placeholder="Pick a project"
          options={projects}
          value={project}
          onChange={setProject}
        />
        <Button appearance="primary" onClick={onDemo} isDisabled={busy || !project}>
          {busy ? "Loading demo…" : "Load demo"}
        </Button>
      </Inline>
      {demo?.error && <SectionMessage appearance="error" title="Could not load the demo"><Text>{demo.error}</Text></SectionMessage>}
      {demo && !demo.error && (
        <SectionMessage appearance="success" title={demo.message}>
          {demo.conflictIssue && (
            <Link href={`/browse/${demo.conflictIssue}`}>Open {demo.conflictIssue} to see the conflict warning</Link>
          )}
        </SectionMessage>
      )}
      {!data && <Spinner label="Reading the ledger" />}
      {data?.error && <SectionMessage appearance="error" title="Could not read the ledger"><Text>{data.error}</Text></SectionMessage>}
      {data && !data.error && (
        <Stack space="space.100">
          <Text>
            {data.chain.ok
              ? `Ledger intact: ${data.chain.count} record${data.chain.count === 1 ? "" : "s"}, hash chain verified.`
              : `Ledger check failed at ${data.chain.brokenAt}: ${data.chain.reason}.`}
            {data.hidden ? ` ${data.hidden} record${data.hidden === 1 ? " is" : "s are"} in projects you cannot open.` : ""}
          </Text>
          <DynamicTable head={head} rows={rowsFor(data.rows)} emptyView="No decisions yet. Comment &quot;Decision: …&quot; on a work item, or load the demo." />
        </Stack>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
