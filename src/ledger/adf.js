/**
 * Jira returns comments and descriptions in Atlassian Document Format (a JSON tree).
 * This flattens it to plain text, keeping paragraph and line breaks so "Decision:" / "Avoid:"
 * lines stay on their own lines.
 */
export function adfToText(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join("");
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = adfToText(node.content ?? []);
  const block = ["paragraph", "heading", "listItem", "codeBlock", "blockquote"].includes(node.type);
  return block ? inner + "\n" : inner;
}
