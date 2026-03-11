import { Place, ScoredPlace, UserVector } from "./types"

export function scorePlaces(
  places: Place[],
  user: UserVector
): ScoredPlace[] {

  return places.map((place) => {

    const v = place.vector

    if (!v) {
      return { place, score: 0 }
    }

    const score =
      (user.food * (v.food ?? 0)) +
      (user.culture * (v.culture ?? 0)) +
      (user.nature * (v.nature ?? 0)) +
      (user.shopping * (v.shopping ?? 0)) +
      (user.activity * (v.activity ?? 0)) +
      (user.atmosphere * (v.atmosphere ?? 0)) +
      (user.tourism * (v.tourism ?? 0))

    return {
      place,
      score
    }

  })

}
