/** Renders `backtick` spans as <code>, everything else as text (the prototype's inl()). */
export function InlineCode({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => (p.length > 2 && p.startsWith("`") && p.endsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : p))}
    </>
  );
}
