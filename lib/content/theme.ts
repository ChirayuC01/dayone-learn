// Per-course accent colours. The dark theme uses the course colour as-is; the light theme needs a
// darker shade of the same hue to stay readable on a light background (the prototype pairs
// #f0b44c with #a86a00 the same way).

import type { CSSProperties } from "react";

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl([r, g, b]: Rgb): Rgb {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: Rgb): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

/** WCAG relative luminance, 0–1. */
export function luminance(hex: string): number {
  const lin = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

const DARK_INK = "#1a1206";
const LIGHT_INK = "#fff8ec";
const LIGHT_BG = "#f5f6f3";
const LIGHT_MIN = 4.2;

export type AccentVars = {
  "--c-accent-dark": string;
  "--c-ink-dark": string;
  "--c-accent-light": string;
  "--c-ink-light": string;
};

/** CSS custom properties for a course accent, consumed by `.course-theme` in globals.css. */
export function accentVars(accent: string): AccentVars {
  const hex = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent.toLowerCase() : "#f0b44c";
  const [h, s0] = rgbToHsl(hexToRgb(hex));
  const s = s0 < 0.05 ? 0 : Math.min(1, s0 + 0.15); // greys stay grey
  // Darken (same hue) until the light-mode accent reads as text on the light background
  // (the prototype's #a86a00 is ~4.1:1).
  let l = 0.36;
  let light = rgbToHex(hslToRgb([h, s, l]));
  while (contrast(light, LIGHT_BG) < LIGHT_MIN && l > 0.1) {
    l -= 0.02;
    light = rgbToHex(hslToRgb([h, s, l]));
  }
  return {
    "--c-accent-dark": hex,
    "--c-ink-dark": contrast(hex, DARK_INK) >= contrast(hex, "#ffffff") ? DARK_INK : "#ffffff",
    "--c-accent-light": light,
    "--c-ink-light": contrast(light, LIGHT_INK) >= 4 ? LIGHT_INK : "#000000",
  };
}

/** accentVars as a React style object. */
export const accentStyle = (accent: string) => accentVars(accent) as unknown as CSSProperties;
