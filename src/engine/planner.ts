import { getPlacesWithVectors } from "@/lib/places"
import { scorePlaces } from "./scoring"
import { selectCandidates } from "./candidate"
import { UserVector } from "./types"

export async function planTrip(user: UserVector) {

  // 1 places load
  const places = await getPlacesWithVectors()

  // 2 scoring
  const scored = scorePlaces(places, user)

  // 3 candidate selection
  const candidates = selectCandidates(scored, 10)

  return {
    candidates
  }

}
