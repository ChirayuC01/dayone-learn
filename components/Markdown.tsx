// Server-rendered lesson Markdown: GFM, sanitised, with the prototype's code-block treatment.
import type { Element, ElementContent } from "hast";
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkDetails from "@/lib/markdown/remark-details";
import { CopyButton } from "./CopyButton";

function textOf(node: ElementContent | Element | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

/** One span per line so every command line gets its own "$ " prompt (continuations and comments don't). */
function CommandLines({ text }: { text: string }) {
  const lines = text.replace(/\n$/, "").split("\n");
  return (
    <code>
      {lines.map((line, i) => {
        const continuation = i > 0 && /\\\s*$/.test(lines[i - 1]!);
        const kind = line.trim() === "" || continuation ? "" : line.trimStart().startsWith("#") ? "c" : "p";
        return (
          <span key={i} className={`ln ${kind}`}>
            {line}
            {i < lines.length - 1 ? "\n" : ""}
          </span>
        );
      })}
    </code>
  );
}

function Pre({ node, children }: ComponentProps<"pre"> & { node?: Element }) {
  const code = node?.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
  const cls = ((code?.properties.className as string[] | undefined) ?? []).join(" ");
  const text = textOf(code);

  if (/language-(bash|sh|shell|console)\b/.test(cls)) {
    return (
      <div className="cb cmd">
        <pre>
          <CommandLines text={text} />
        </pre>
        <CopyButton text={text.replace(/\n$/, "")} />
      </div>
    );
  }
  return (
    <div className={`cb ${/language-output\b/.test(cls) ? "out" : "diagram"}`}>
      <pre>{children}</pre>
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkDetails]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        pre: Pre,
        table: ({ node, ...props }) => (
          <div className="tbl">
            <table {...props} />
          </div>
        ),
        a: ({ node, href, ...props }) => {
          const external = typeof href === "string" && /^https?:\/\//.test(href);
          return <a href={href} {...props} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} />;
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
