import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseDecision, splitTerms } from "../src/ledger/parse.js";
import { link, verify, GENESIS } from "../src/ledger/chain.js";
import { conflicts, inForce, mentions, supersededBy } from "../src/ledger/match.js";
import { adfToText } from "../src/ledger/adf.js";

describe("parseDecision", () => {
  it("reads a full decision comment", () => {
    const d = parseDecision("Decision: Use PostgreSQL for all new services.\nAvoid: MongoDB, DynamoDB\nScope: component=backend\nSupersedes: dl-3");
    expect(d).toEqual({
      statement: "Use PostgreSQL for all new services.",
      avoid: ["MongoDB", "DynamoDB"],
      scope: { components: ["backend"], labels: [] },
      supersedes: "DL-3",
    });
  });

  it("ignores comments that only mention a decision later", () => {
    expect(parseDecision("Looks good.\nDecision: maybe later")).toBeNull();
    expect(parseDecision("")).toBeNull();
    expect(parseDecision("Decision:   ")).toBeNull();
  });

  it("de-duplicates avoid terms", () => {
    expect(splitTerms("Mongo, mongo; Redis.")).toEqual(["Mongo", "Redis"]);
  });
});

const base = (i, extra = {}) => ({
  id: `DL-${i}`, projectKey: "PAY", statement: `s${i}`, avoid: [], scope: { components: [], labels: [] },
  supersedes: null, sourceIssue: `PAY-${i}`, sourceComment: String(i), author: "a", createdAt: `2026-11-${String(10 + i).padStart(2, "0")}T00:00:00Z`, ...extra,
});

function chainOf(rows) {
  const out = [];
  for (const r of rows) out.push(link(r, out[out.length - 1]));
  return out;
}

describe("hash chain", () => {
  it("verifies an untouched ledger and starts from the genesis hash", () => {
    const rows = chainOf([base(1), base(2), base(3)]);
    expect(rows[0].prevHash).toBe(GENESIS);
    expect(verify(rows)).toEqual({ ok: true, count: 3 });
  });

  it("any edit to any field of any row is caught at that row", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), fc.nat(), fc.string({ minLength: 1 }), (n, pick, junk) => {
        const rows = chainOf(Array.from({ length: n }, (_, i) => base(i + 1)));
        const i = pick % n;
        const tampered = rows.map((r, j) => (j === i ? { ...r, statement: r.statement + junk } : r));
        const res = verify(tampered);
        expect(res.ok).toBe(false);
        expect(res.brokenAt).toBe(rows[i].id);
      }),
    );
  });

  it("deleting a middle row is caught at the row after it", () => {
    const rows = chainOf([base(1), base(2), base(3)]);
    expect(verify([rows[0], rows[2]])).toMatchObject({ ok: false, brokenAt: "DL-3" });
  });
});

describe("in force and conflicts", () => {
  const rows = chainOf([
    base(1, { statement: "Use MongoDB", avoid: [] }),
    base(2, { statement: "Use PostgreSQL", avoid: ["MongoDB"], supersedes: "DL-1" }),
    base(3, { statement: "No vendor SDKs in the backend", avoid: ["Firebase"], scope: { components: ["backend"], labels: [] } }),
  ]);

  it("a superseded decision is no longer in force", () => {
    expect(inForce(rows).map((r) => r.id)).toEqual(["DL-3", "DL-2"]);
    expect(supersededBy(rows, "DL-1").id).toBe("DL-2");
  });

  it("flags a new item that uses an avoided term, and names the term", () => {
    const hit = conflicts(rows, { key: "PAY-9", projectKey: "PAY", text: "Store sessions in MongoDB" });
    expect(hit.map((h) => [h.decision.id, h.term])).toEqual([["DL-2", "MongoDB"]]);
  });

  it("respects scope and project", () => {
    expect(conflicts(rows, { key: "PAY-9", projectKey: "PAY", text: "Add Firebase auth", components: ["frontend"] })).toEqual([]);
    expect(conflicts(rows, { key: "PAY-9", projectKey: "PAY", text: "Add Firebase auth", components: ["Backend"] }).map((h) => h.decision.id)).toEqual(["DL-3"]);
    expect(conflicts(rows, { key: "WEB-1", projectKey: "WEB", text: "MongoDB" })).toEqual([]);
  });

  it("the issue where the decision was made does not conflict with it", () => {
    expect(conflicts(rows, { key: "PAY-2", projectKey: "PAY", text: "MongoDB" })).toEqual([]);
  });

  it("matches whole words only", () => {
    expect(mentions("we use mongodb here", "MongoDB")).toBe(true);
    expect(mentions("MongoDBX", "MongoDB")).toBe(false);
    expect(mentions("用 MongoDB 存", "MongoDB")).toBe(true);
  });
});

describe("adfToText", () => {
  it("keeps line breaks between paragraphs and hard breaks", () => {
    const doc = { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "Decision: Use PostgreSQL" }, { type: "hardBreak" }, { type: "text", text: "Avoid: MongoDB" }] },
      { type: "paragraph", content: [{ type: "text", text: "Scope: component=backend" }] },
    ] };
    expect(parseDecision(adfToText(doc))).toMatchObject({ statement: "Use PostgreSQL", avoid: ["MongoDB"], scope: { components: ["backend"] } });
  });
});

import { checkSupersede } from "../src/ledger/match.js";

describe("checkSupersede", () => {
  const rows = chainOf([base(1), base(2, { supersedes: "DL-1" }), base(3, { projectKey: "WEB" })]);
  it("allows superseding a decision in force in the same project", () => {
    expect(checkSupersede(rows, "DL-2", "PAY")).toEqual({ ok: true });
  });
  it("refuses another project's decision, a missing one, and an already superseded one", () => {
    expect(checkSupersede(rows, "DL-3", "PAY").ok).toBe(false);
    expect(checkSupersede(rows, "DL-9", "PAY").ok).toBe(false);
    expect(checkSupersede(rows, "DL-1", "PAY").reason).toMatch(/already superseded/);
  });
});
