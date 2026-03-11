import { getPlacesWithVectors } from "@/lib/places"
import { selectCandidates } from "./candidate"
import { scorePlaces } from "./scoring"
import { buildSchedule, densityToPlaces } from "./schedule"
import { TripPlanResult, TripUserInput } from "./types"

export async function planTrip(input: TripUserInput): Promise<TripPlanResult> {
  const { days, daily_density, userVector } = input

  const places = await getPlacesWithVectors()

  const scored = scorePlaces(places, userVector)

  const placesPerDay = densityToPlaces(daily_density)
  const totalSlots = days * placesPerDay
  const candidateK = Math.max(totalSlots * 3, 10)

  const candidates = selectCandidates(scored, candidateK)

  const schedule = buildSchedule({
    candidates,
    days,
    dailyDensity: daily_density,
  })

  return {
    candidates,
    schedule,
    meta: {
      days,
      daily_density,
      places_per_day: placesPerDay,
      total_selected: schedule.reduce((acc, day) => acc + day.places.length, 0),
    },
  }
}
