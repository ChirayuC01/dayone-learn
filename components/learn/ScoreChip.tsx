import { scoreTone } from "@/lib/quiz/grade";

/** The prototype's best-score chip: green ≥ 80 %, amber ≥ 50 %, red below. */
export function ScoreChip({ best, total }: { best: number; total: number }) {
  return (
    <span className={`chip ${scoreTone(best, total)}`} title="Best score">
      {best}/{total}
    </span>
  );
}
