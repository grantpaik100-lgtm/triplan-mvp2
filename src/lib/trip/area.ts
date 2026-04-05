/**
 * TriPlan V3
 * Current Role:
 * - area/region 관련 거리감, 인접성, 지역 분류 보조 로직을 담당하는 파일이다.
 *
 * Target Role:
 * - planning/scheduling에서 사용하는 지역 계산 helper로 유지되어야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - area / region metadata
 *
 * Outputs:
 * - area relation helpers
 *
 * Called From:
 * - src/lib/trip/planning.ts
 * - src/lib/trip/scheduling.ts
 *
 * Side Effects:
 * - 없음
 *
 * Current Status:
 * - canonical
 *
 * Decision:
 * - keep
 *
 * Move Target:
 * - 없음
 *
 * Notes:
 * - cluster/day grouping 품질에 직접 연결될 수 있다.
 */

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
