import type { ScoredPlace, UserModel } from "./types";

export function selectCandidates(
  scored: ScoredPlace[],
  user: UserModel
): ScoredPlace[] {
  const totalSlots = user.days * user.constraints.placesPerDay;
  const candidateK = Math.max(totalSlots * 3, 12);

  const filtered = scored.filter(
    (item) => item.place.vector !== null && item.score > 0
  );

  const sorted = [...filtered].sort((a, b) => b.score - a.score);

  return sorted.slice(0, candidateK);
}
