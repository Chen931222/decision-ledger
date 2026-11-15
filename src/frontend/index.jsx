/**
 * Issue panel: shows decisions this work item conflicts with, decisions made on this item, and
 * whether the ledger's hash chain is intact. Everything shown is computed by code in the resolver.
 */

import React, { useEffect, useState } from "react";
import ForgeReconciler, { Stack, Text, SectionMessage, Link, Lozenge, Inline, Spinner, Strong } from "@forge/react";
import { invoke } from "@forge/bridge";

const day = (iso) => String(iso).slice(0, 10);
const sourceUrl = (d) => `/browse/${d.sourceIssue}?focusedCommentId=${d.sourceComment}`;

function Conflict({ d }) {
  if (d.restricted) {
    return (
      <SectionMessage appearance="warning" title={`Conflicts with ${d.id}`}>
        <Text>This decision was made on a work item you cannot open. Ask its project's team before going ahead.</Text>
      </SectionMessage>
    );
  }
  return (
    <SectionMessage appearance="warning" title={`Conflicts with ${d.id}, in force since ${day(d.createdAt)}`}>
      <Stack space="space.075">
        <Text>{d.statement}</Text>
        <Text>
          This work item mentions <Strong>{d.term}</Strong>, which {d.id} says to avoid.
        </Text>
        <Link href={sourceUrl(d)}>Where it was decided: {d.sourceIssue}</Link>
      </Stack>
    </SectionMessage>
  );
}

function MadeHere({ d }) {
  return (
    <Inline space="space.100" alignBlock="center">
      <Lozenge appearance={d.supersededBy ? "removed" : "success"}>{d.supersededBy ? `superseded by ${d.supersededBy}` : "in force"}</Lozenge>
      <Text>
        <Strong>{d.id}</Strong> {d.statement}
      </Text>
    </Inline>
  );
}

const App = () => {
  const [data, setData] = useState(null);
  useEffect(() => {
    invoke("getPanel").then(setData).catch((e) => setData({ error: String(e?.message ?? e) }));
  }, []);

  if (!data) return <Spinner label="Checking decisions" />;
  if (data.error) return <SectionMessage appearance="error" title="Could not check decisions"><Text>{data.error}</Text></SectionMessage>;

  return (
    <Stack space="space.150">
      {data.conflicts.length > 0 ? (
        data.conflicts.map((d) => <Conflict key={d.id} d={d} />)
      ) : (
        <Text>No conflict with the {data.inForceInProject} decision{data.inForceInProject === 1 ? "" : "s"} in force in this project.</Text>
      )}
      {data.madeHere.length > 0 && (
        <Stack space="space.075">
          <Text><Strong>Decided on this work item</Strong></Text>
          {data.madeHere.map((d) => <MadeHere key={d.id} d={d} />)}
        </Stack>
      )}
      <Text>
        {data.chain.ok
          ? `Ledger intact: ${data.chain.count} record${data.chain.count === 1 ? "" : "s"}, hash chain verified.`
          : `Ledger check failed at ${data.chain.brokenAt}: ${data.chain.reason}.`}
      </Text>
      <Text>To record a decision, comment: "Decision: …", then optional lines "Avoid: …", "Scope: component=…", "Supersedes: DL-…".</Text>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
