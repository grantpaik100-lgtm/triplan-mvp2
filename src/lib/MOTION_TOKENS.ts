// src/lib/MOTION_TOKENS.ts
// TriPlan design + motion tokens (single source of truth)

export const MOTION = {
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  duration: {
    fast: 160,
    base: 220,
    slow: 320,
    page: 420,
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
  // optional accents you can grow into later
  danger: "#FF4D4D",
  success: "#2DBE7E",
} as const;

export const FOCUS_RING = {
  ring: "0 0 0 3px rgba(76, 141, 255, 0.35)",
} as const;

/**
 * Layout tokens
 * - SPACE: spacing scale (px)
 * - RADIUS: corner radius scale (px)
 * - MAXWIDTH: layout max widths (px)
 */
export const SPACE = {
  0: 0,
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  14: 14,
  16: 16,
  18: 18,
  20: 20,
  24: 24,
  28: 28,
  32: 32,
  40: 40,
  48: 48,
  56: 56,
  64: 64,
} as const;

export const RADIUS = {
  sm: 12,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
} as const;

export const MAXWIDTH = {
  card: 620, // primary/survey cards
  chat: 720, // LLM chat container
  itinerary: 820, // schedule view (more dense)
} as const;

/**
 * Typography tokens (px)
 * Keep it minimal; adjust in one place later.
 */
export const TYPE = {
  h1: { size: 22, lineHeight: 1.25, weight: 800 },
  h2: { size: 18, lineHeight: 1.3, weight: 800 },
  title: { size: 16, lineHeight: 1.35, weight: 800 },
  body: { size: 14, lineHeight: 1.55, weight: 600 },
  caption: { size: 12, lineHeight: 1.5, weight: 600 },
  tiny: { size: 11, lineHeight: 1.45, weight: 600 },
} as const;

/**
 * Density profiles
 * - Use when itinerary/survey UI needs to become tighter/looser.
 * - This is the bridge to "mood ↔ UI sync" later.
 */
export const DENSITY = {
  loose: {
    cardPadX: 22,
    cardPadY: 22,
    rowGap: 14,
    sectionGap: 18,
    buttonHeight: 48,
    chipHeight: 40,
    scaleButtonSize: 42,
    textScale: 1.0,
  },
  base: {
    cardPadX: 20,
    cardPadY: 20,
    rowGap: 12,
    sectionGap: 16,
    buttonHeight: 46,
    chipHeight: 38,
    scaleButtonSize: 40,
    textScale: 1.0,
  },
  dense: {
    cardPadX: 16,
    cardPadY: 16,
    rowGap: 10,
    sectionGap: 12,
    buttonHeight: 42,
    chipHeight: 34,
    scaleButtonSize: 36,
    textScale: 0.98,
  },
} as const;

/**
 * Z-index layers
 * Useful for chat input sticky, bottom sheets, modals, toasts.
 */
export const Z = {
  base: 0,
  sticky: 10,
  overlay: 20,
  modal: 30,
  toast: 40,
} as const;
