import { AREA_DISTANCE_MINUTES } from "./constants";
import type { Area } from "./types";

export function normalizeArea(regionRaw: string): Area {
  const value = regionRaw.trim();

  switch (value) {
    case "홍대":
      return "hongdae";
    case "성수":
      return "seongsu";
    case "이태원":
      return "itaewon";
    case "한남":
      return "hannam";
    case "종로":
      return "jongno";
    case "익선동":
      return "ikseondong";
    case "북촌":
      return "bukchon";
    case "잠실":
      return "jamsil";
    case "여의도":
      return "yeouido";
    case "강남":
      return "gangnam";
    default:
      return "other";
  }
}

export function getAreaDistanceMinutes(from: Area, to: Area): number {
  return AREA_DISTANCE_MINUTES[from]?.[to] ?? 40;
}
