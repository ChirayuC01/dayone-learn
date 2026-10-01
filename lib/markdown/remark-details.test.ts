import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import remarkDetails from "./remark-details.ts";

const parse = (md: string) => {
  const proc = unified().use(remarkParse).use(remarkDetails);
  return proc.runSync(proc.parse(md)) as Root;
};

describe("remarkDetails", () => {
  it("wraps the markdown between <details> and </details>", () => {
    const tree = parse("<details>\n<summary>Show the solution</summary>\n\n```bash\nls\n```\n</details>\n\nafter");
    const [details, after] = tree.children;
    expect(details).toMatchObject({ type: "blockquote", data: { hName: "details" } });
    const kids = (details as { children: { type: string; data?: unknown }[] }).children;
    expect(kids[0]).toMatchObject({ data: { hName: "summary" }, children: [{ value: "Show the solution" }] });
    expect(kids[1]).toMatchObject({ type: "code", lang: "bash", value: "ls" });
    expect(after).toMatchObject({ type: "paragraph" });
  });

  it("handles a summary in its own block and nested details", () => {
    const tree = parse("<details>\n\n<summary>Outer</summary>\n\n<details>\n<summary>Inner</summary>\n\nx\n\n</details>\n\n</details>");
    const outer = tree.children[0] as { children: { data?: { hName?: string } }[] };
    expect(tree.children).toHaveLength(1);
    expect(outer.children[0]).toMatchObject({ children: [{ value: "Outer" }] });
    expect(outer.children[1]).toMatchObject({ data: { hName: "details" } });
  });

  it("leaves unclosed details and other HTML untouched", () => {
    expect(parse("<details>\n<summary>x</summary>\n\nno close").children[0]).toMatchObject({ type: "html" });
    expect(parse("<div>hi</div>").children[0]).toMatchObject({ type: "html" });
  });

  it("closes every <details> in the Linux seed lessons", () => {
    const dir = join(import.meta.dirname, "..", "..", "reference", "seed", "linux");
    for (const f of readdirSync(dir).filter((x) => x.startsWith("day-"))) {
      const { content } = JSON.parse(readFileSync(join(dir, f), "utf8")) as { content: Record<string, string> };
      for (const md of Object.values(content)) {
        const leftovers = JSON.stringify(parse(md)).match(/"value":"<\/?details/g);
        expect(leftovers, f).toBeNull();
      }
    }
  });
});
