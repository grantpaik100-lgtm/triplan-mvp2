import { getPlaceByIds, getPlacesWithVectors } from "@/lib/places";
import { buildUserModel } from "./userModel";
import { scorePlaces } from "./scoring";
import { selectCandidates } from "./candidate";
import { buildSchedule } from "./schedule";
import type { PlanTripInput, TripPlanResult } from "./types";

export async function planTrip(input: PlanTripInput): Promise<TripPlanResult> {
  // 1. user model 생성
  const userModel = buildUserModel(input);

  // 2. place 로드
  const places = await getPlacesWithVectors();

  // 3. scoring
  const scored = scorePlaces(places, userModel);

  // 4. candidate selection
  const candidates = selectCandidates(scored, userModel);

  // 5. must place 로드
  const mustPlaces =
    userModel.must.placeIds.length > 0
      ? await getPlaceByIds(userModel.must.placeIds)
      : [];

  // 6. schedule
  const schedule = buildSchedule({
    candidates,
    mustPlaces,
    user: userModel,
  });

  return {
    userModel,
    candidates,
    schedule,
    meta: {
      candidate_count: candidates.length,
      total_selected: schedule.reduce((acc, day) => acc + day.places.length, 0),
      places_per_day: userModel.constraints.placesPerDay,
      days: userModel.days,
    },
  };
}
