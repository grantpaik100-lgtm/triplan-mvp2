import { NextResponse } from "next/server";
import { planTrip } from "@/engine/planner";

export async function GET() {
  const result = await planTrip({
    primary: {
      rest: 0.6,
      schedule: 0.2,
      mood: 0.15,
      strategy: 0.05,
    },
    secondary: {
      city: "Seoul",
      days: 2,
      companion: "friend",
      budget_level: 3,
      pace: 3,
      chronotype: "neutral",
      walk_tolerance: 3,
      waiting_tolerance: 3,
      food_importance: 4,
      daily_density: 3,
      must_place_ids: [],
      must_foods: [],
      must_experiences: [],
    },
  });

  
return NextResponse.json({
  marker: "generatetrip-new-route",
  result,
});
}
