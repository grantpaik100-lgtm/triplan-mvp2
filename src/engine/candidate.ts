import { ScoredPlace } from "./types"

export function selectCandidates(
  scored: ScoredPlace[],
  k: number = 20
): ScoredPlace[] {

  const sorted = [...scored].sort(
    (a, b) => b.score - a.score
  )

  return sorted.slice(0, k)
}
