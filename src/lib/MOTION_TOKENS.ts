// src/lib/MOTION_TOKENS.ts

export const MOTION = {
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  duration: {
    fast: 160,
    base: 220,
    slow: 320,
  },
  enter: {
    from: { opacity: 0, scale: 0.985, blurPx: 6 },
    to: { opacity: 1, scale: 1, blurPx: 0 },
  },
} as const;

export const GLASS = {
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(20,35,60,0.08)",
  backdropBlurPx: 14,
} as const;

export const SHADOW = {
  level1: "0 8px 20px rgba(15,30,60,0.06)",
  level2: "0 18px 50px rgba(15,30,60,0.08)",
  level3: "0 30px 90px rgba(15,30,60,0.10)",
} as const;

export const COLORS = {
  sky1: "#EAF6FF",
  sky2: "#FFFFFF",
  text: "#111111",
  muted: "#5A6472",
  line: "rgba(20,35,60,0.10)",
  focus: "#4C8DFF",
} as const;

export const FOCUS_RING = {
  ring: "0 0 0 3px rgba(76, 141, 255, 0.35)",
} as const;
