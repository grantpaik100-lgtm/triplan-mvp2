/**
 * TriPlan V3
 * Current Role:
 * - Secondary survey draft를 localStorage에 저장/복원하는 storage helper file이다.
 *
 * Target Role:
 * - src/lib/storage/secondaryDraft.ts로 이동되어 secondary chain의 공식 draft persistence helper가 되어야 한다.
 *
 * Chain:
 * - storage
 *
 * Inputs:
 * - secondary answers draft
 *
 * Outputs:
 * - localStorage read/write helpers
 *
 * Called From:
 * - app/secondary/SecondaryMiniApp.tsx
 *
 * Side Effects:
 * - localStorage read/write
 *
 * Current Status:
 * - canonical, but storage namespace separation needed
 *
 * Decision:
 * - move
 *
 * Move Target:
 * - src/lib/storage/secondaryDraft.ts
 *
 * Notes:
 * - 기능은 필요하지만 위치가 애매하다.
 * - storage 계층 분리 시 가장 먼저 옮길 후보다.
 */
// src/lib/secondaryStorage.ts

type SecondaryDraft = {
  mode?: "intro" | "question" | "summary"| "handoff";
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
