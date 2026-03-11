import { NextResponse } from "next/server";
import { getPlacesWithVectors } from "@/lib/places";

export async function GET() {
  try {
    const places = await getPlacesWithVectors();

    return NextResponse.json({
      count: places.length,
      places
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load places" },
      { status: 500 }
    );
  }
}
