// src/lib/secondaryStorage.ts
// 로컬 임시 저장 (옵션 A)
const KEY = "triplan_secondary_draft_v1";

export function loadSecondaryDraft(): any | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSecondaryDraft(draft: any) {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function clearSecondaryDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
