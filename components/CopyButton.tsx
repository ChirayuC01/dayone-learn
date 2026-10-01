"use client";

import { useRef, useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState("copy");
  const ref = useRef<HTMLButtonElement>(null);

  function selectFallback() {
    const code = ref.current?.parentElement?.querySelector("code");
    if (!code) return;
    const range = document.createRange();
    range.selectNodeContents(code);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    setLabel("press Ctrl+C");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setLabel("copied");
      setTimeout(() => setLabel("copy"), 1400);
    } catch {
      selectFallback();
    }
  }

  return (
    <button ref={ref} type="button" className="copy" onClick={copy} aria-label="Copy command">
      {label}
    </button>
  );
}
