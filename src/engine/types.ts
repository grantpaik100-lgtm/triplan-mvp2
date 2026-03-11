export type PlaceVector = {
  food: number | null
  culture: number | null
  nature: number | null
  shopping: number | null
  activity: number | null
  atmosphere: number | null
  tourism: number | null
  price: number | null
  crowd: number | null
  duration: number | null
}

export type Place = {
  id: string
  name: string
  region: string | null
  category: string | null
  avg_duration_min: number | null
  vector: PlaceVector | null
}

export type UserVector = {
  food: number
  culture: number
  nature: number
  shopping: number
  activity: number
  atmosphere: number
  tourism: number
  price: number
  crowd: number
  duration: number
}

export type ScoredPlace = {
  place: Place
  score: number
}
