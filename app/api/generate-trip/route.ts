import { NextResponse } from "next/server"
import { planTrip } from "@/engine/planner"

export async function GET() {
  const result = await planTrip({
    days: 2,
    daily_density: 3,
    userVector: {
      food: 0.6,
      culture: 0.8,
      nature: 0.2,
      shopping: 0.1,
      activity: 0.3,
      atmosphere: 0.7,
      tourism: 0.9,
      price: 0.3,
      crowd: 0.5,
      duration: 0.6,
    },
  })

  return NextResponse.json(result)
}
