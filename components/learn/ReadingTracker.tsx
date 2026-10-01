"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCelebrate } from "@/components/gamify/Celebrate";
import type { ReadingResult } from "@/lib/learning/reading";

const BEAT_MS = 15_000;
const MIN_MS = 60_000;

async function send(lessonId: string, event: "start" | "beat" | "finish"): Promise<ReadingResult | null> {
  try {
    const res = await fetch("/api/reading", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId, event }) });
    return (await res.json()) as ReadingResult;
  } catch {
    return null;
  }
}

/**
 * Placed at the end of a lesson. Sends a heartbeat every 15 s while the tab is visible and asks the
 * server to mark the lesson read once this marker has been seen and a minute has passed.
 */
export function ReadingTracker({ lessonId, alreadyRead }: { lessonId: string; alreadyRead: boolean }) {
  const [state, setState] = useState<"reading" | "read">(alreadyRead ? "read" : "reading");
  const marker = useRef<HTMLDivElement>(null);
  const reachedEnd = useRef(false);
  const startedAt = useRef(0);
  const done = useRef(alreadyRead);
  const celebrate = useCelebrate();
  const router = useRouter();

  useEffect(() => {
    if (alreadyRead) return;
    startedAt.current = Date.now();
    done.current = false;
    void send(lessonId, "start");

    async function tryFinish() {
      if (done.current || !reachedEnd.current || Date.now() - startedAt.current < MIN_MS) return;
      const r = await send(lessonId, "finish");
      if (r?.status === "read" || r?.status === "already-read") {
        done.current = true;
        setState("read");
        if (r.status === "read") {
          celebrate(r.rewards);
          router.refresh();
        }
      }
    }

    const beat = setInterval(async () => {
      if (document.visibilityState !== "visible" || done.current) return;
      await send(lessonId, "beat");
      await tryFinish();
    }, BEAT_MS);

    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        reachedEnd.current = true;
        void tryFinish();
      }
    });
    if (marker.current) io.observe(marker.current);
    return () => {
      clearInterval(beat);
      io.disconnect();
    };
  }, [lessonId, alreadyRead, celebrate, router]);

  return (
    <div ref={marker} className={`readmark${state === "read" ? " done" : ""}`}>
      {state === "read" ? "✓ Lesson read" : "Finish the lesson and spend at least a minute on it to mark it read (+10 XP)."}
    </div>
  );
}
