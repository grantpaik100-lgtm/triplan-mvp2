import { DayPlan, ScoredPlace } from "./types"

export function densityToPlaces(density: number): number {
  switch (density) {
    case 1:
      return 2
    case 2:
      return 3
    case 3:
      return 4
    case 4:
      return 5
    case 5:
      return 6
    default:
      return 4
  }
}

type BuildScheduleParams = {
  candidates: ScoredPlace[]
  days: number
  dailyDensity: number
  maxDayDurationMin?: number
}

export function buildSchedule({
  candidates,
  days,
  dailyDensity,
  maxDayDurationMin = 8 * 60,
}: BuildScheduleParams): DayPlan[] {
  const placesPerDay = densityToPlaces(dailyDensity)
  const usedPlaceIds = new Set<string>()
  const schedule: DayPlan[] = []

  let cursor = 0

  for (let day = 1; day <= days; day += 1) {
    const dayPlaces: ScoredPlace[] = []
    let dayDuration = 0

    while (
      dayPlaces.length < placesPerDay &&
      cursor < candidates.length
    ) {
      const candidate = candidates[cursor]
      cursor += 1

      if (!candidate) continue

      const placeId = candidate.place.id
      const duration = candidate.place.avg_duration_min ?? 90

      if (usedPlaceIds.has(placeId)) {
        continue
      }

      if (dayDuration + duration > maxDayDurationMin) {
        continue
      }

      dayPlaces.push(candidate)
      usedPlaceIds.add(placeId)
      dayDuration += duration
    }

    schedule.push({
      day,
      places: dayPlaces,
      total_estimated_duration_min: dayDuration,
    })
  }

  return schedule
}
