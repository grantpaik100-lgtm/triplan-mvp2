import { DesignSpec } from "./types";

const KEY = "triplan_mvp0_latest";

export function saveLocal(spec: Partial<DesignSpec>) {
  try {
    const prev = loadLocal() || {};
    const next = { ...prev, ...spec };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export function loadLocal(): Partial<DesignSpec> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function resetLocal() {
  try { localStorage.removeItem(KEY); } catch {}
}
