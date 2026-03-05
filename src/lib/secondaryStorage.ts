// src/lib/secondaryStorage.ts

type SecondaryDraft = {
  mode?: "intro" | "question" | "summary";
  idx?: number;
  answers?: Record<string, any>;
  returnToSummary?: boolean;
  editSection?: string;
  savedAt?: number;
};

const KEY = "triplan_secondary_draft_v1";

function safeParse(json: string | null): SecondaryDraft | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as SecondaryDraft;
  } catch {
    return null;
  }
}

export function loadSecondaryDraft(): SecondaryDraft | null {
  if (typeof window === "undefined") return null;
  return safeParse(window.localStorage.getItem(KEY));
}

export function saveSecondaryDraft(draft: SecondaryDraft): void {
  if (typeof window === "undefined") return;
  try {
    const payload: SecondaryDraft = { ...draft, savedAt: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function clearSecondaryDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
