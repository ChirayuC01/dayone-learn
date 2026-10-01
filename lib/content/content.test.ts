import { describe, expect, it } from "vitest";
import {
  buildOutline,
  lessonMarkdown,
  lessonTitle,
  neighbours,
  pad,
  parseDayParam,
  readingMinutes,
  resolveTrack,
} from "./outline.ts";
import { accentVars, contrast } from "./theme.ts";

const tracks = [
  { key: "wsl", label: "WSL" },
  { key: "linux", label: "Linux" },
];

describe("route params and tracks", () => {
  it("pads and parses day numbers", () => {
    expect(pad(7)).toBe("07");
    expect(pad(66)).toBe("66");
    expect(parseDayParam("07")).toBe(7);
    expect(parseDayParam("7")).toBe(7);
    expect(parseDayParam("0")).toBeNull();
    expect(parseDayParam("-1")).toBeNull();
    expect(parseDayParam("1e2")).toBeNull();
    expect(parseDayParam("abc")).toBeNull();
  });

  it("falls back to the default track for unknown or missing tracks", () => {
    expect(resolveTrack(tracks, "wsl", "linux")).toBe("linux");
    expect(resolveTrack(tracks, "wsl", "mac")).toBe("wsl");
    expect(resolveTrack(tracks, "wsl", undefined)).toBe("wsl");
  });

  it("uses per-track titles and content with fallbacks", () => {
    const lesson = { title: "WSL setup", trackTitles: { linux: "Getting Linux" } };
    expect(lessonTitle(lesson, "linux")).toBe("Getting Linux");
    expect(lessonTitle(lesson, "wsl")).toBe("WSL setup");
    expect(lessonTitle({ title: "T", trackTitles: null }, "wsl")).toBe("T");
    expect(lessonMarkdown({ wsl: "w", linux: "l" }, "linux", "wsl")).toBe("l");
    expect(lessonMarkdown({ wsl: "w" }, "linux", "wsl")).toBe("w");
    expect(lessonMarkdown({ other: "o" }, "linux", "wsl")).toBe("o");
    expect(lessonMarkdown({}, "linux", "wsl")).toBe("");
  });

  it("estimates reading time", () => {
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("word ".repeat(3000))).toBe(15);
  });
});

describe("buildOutline", () => {
  const input = {
    modules: [
      { number: 2, title: "Files", dayFrom: 3, dayTo: 3, testQuestions: 0 },
      { number: 1, title: "Start", dayFrom: 1, dayTo: 2, testQuestions: 12 },
    ],
    syllabus: [
      { day: 2, moduleNumber: 1, title: "Planned two" },
      { day: 1, moduleNumber: 1, title: "Planned one" },
      { day: 3, moduleNumber: 2, title: "Planned three" },
    ],
    lessons: [{ day: 1, title: "Published one", trackTitles: { linux: "Linux one" } }],
  };

  it("orders modules and days and marks published vs upcoming", () => {
    const out = buildOutline(input, "wsl");
    expect(out.map((m) => m.number)).toEqual([1, 2]);
    expect(out[0]!.days).toEqual([
      { day: 1, title: "Published one", state: "published" },
      { day: 2, title: "Planned two", state: "upcoming" },
    ]);
    expect(out[0]).toMatchObject({ published: 1, hasTest: true });
    expect(out[1]).toMatchObject({ published: 0, hasTest: false });
  });

  it("uses the track title for published days", () => {
    expect(buildOutline(input, "linux")[0]!.days[0]!.title).toBe("Linux one");
  });

  it("finds published neighbours across gaps", () => {
    expect(neighbours([1, 2, 5], 2)).toEqual({ prev: 1, next: 5 });
    expect(neighbours([1, 2, 5], 1)).toEqual({ prev: null, next: 2 });
    expect(neighbours([5, 1], 5)).toEqual({ prev: 1, next: null });
  });
});

describe("accentVars", () => {
  it("keeps the dark accent and darkens the same hue for light mode", () => {
    const v = accentVars("#F0B44C");
    expect(v["--c-accent-dark"]).toBe("#f0b44c");
    expect(v["--c-ink-dark"]).toBe("#1a1206");
    expect(contrast(v["--c-accent-light"], "#f5f6f3")).toBeGreaterThanOrEqual(4.2);
    expect(v["--c-ink-light"]).toBe("#fff8ec");
  });

  it("picks white ink on dark accents and readable light-mode shades for any hue", () => {
    expect(accentVars("#1d4ed8")["--c-ink-dark"]).toBe("#ffffff");
    for (const hex of ["#5fd0a6", "#ffff00", "#3b82f6", "#e11d48", "#ffffff"]) {
      const v = accentVars(hex);
      expect(contrast(v["--c-accent-light"], "#f5f6f3"), hex).toBeGreaterThanOrEqual(4.2);
      expect(contrast(v["--c-accent-light"], v["--c-ink-light"]), hex).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps greys grey in light mode", () => {
    const [r, g, b] = accentVars("#ffffff")["--c-accent-light"].slice(1).match(/../g)!;
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("falls back to the default amber for invalid input", () => {
    expect(accentVars("red")["--c-accent-dark"]).toBe("#f0b44c");
  });
});
