"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Phone top bar + sidebar drawer. On wide screens the sidebar is a sticky column and this is inert. */
export function Drawer({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const side = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!side.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <>
      <div className="topbar">
        <button
          ref={button}
          type="button"
          className="menu-btn"
          aria-controls="side"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          ☰ Lessons
        </button>
        {brand}
      </div>
      <nav ref={side} id="side" className={`side${open ? " open" : ""}`} aria-label="Lessons">
        {children}
      </nav>
    </>
  );
}
