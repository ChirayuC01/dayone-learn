// remark plugin: turns `<details><summary>…</summary> … </details>` HTML blocks into real
// details/summary elements while keeping the Markdown in between. Every other raw HTML node is
// left as-is, and react-markdown then drops it (no rehype-raw), so this is the only HTML we let through.
import type { Paragraph, Parent, Root, RootContent } from "mdast";

const OPEN = /^<details(?:\s[^>]*)?>\s*/i;
const CLOSE = /^<\/details>$/i;
const SUMMARY = /<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i;

const isOpen = (n: RootContent) => n.type === "html" && OPEN.test(n.value.trim());
const isClose = (n: RootContent) => n.type === "html" && CLOSE.test(n.value.trim());
const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").trim();

function summaryNode(text: string): Paragraph {
  return {
    type: "paragraph",
    data: { hName: "summary" },
    children: [{ type: "text", value: text || "Details" }],
  };
}

function transform(children: RootContent[]): RootContent[] {
  const out: RootContent[] = [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i]!;
    if ("children" in node && Array.isArray(node.children)) {
      (node as Parent).children = transform((node as Parent).children as RootContent[]) as Parent["children"];
    }
    if (!isOpen(node) || node.type !== "html") {
      out.push(node);
      continue;
    }

    // find the matching </details>, allowing nesting
    let depth = 1;
    let j = i + 1;
    for (; j < children.length; j++) {
      if (isOpen(children[j]!)) depth++;
      else if (isClose(children[j]!) && --depth === 0) break;
    }
    if (j >= children.length) {
      out.push(node); // unclosed: leave it alone
      continue;
    }

    let inner = children.slice(i + 1, j);
    let summary = SUMMARY.exec(node.value)?.[1];
    // <summary> may be its own HTML block right after <details>
    if (summary === undefined && inner[0]?.type === "html" && SUMMARY.test(inner[0].value)) {
      summary = SUMMARY.exec(inner[0].value)![1];
      inner = inner.slice(1);
    }

    out.push({
      // a blockquote carries flow content; hName renders it as <details>
      type: "blockquote",
      data: { hName: "details" },
      children: [summaryNode(stripTags(summary ?? "")), ...(transform(inner) as Paragraph[])],
    });
    i = j;
  }
  return out;
}

export default function remarkDetails() {
  return (tree: Root) => {
    tree.children = transform(tree.children);
  };
}
