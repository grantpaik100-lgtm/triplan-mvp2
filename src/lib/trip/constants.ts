
/**
 * TriPlan V3
 * Current Role:
 * - trip engine 전반에서 사용하는 공통 상수(time bucket, defaults, policy-like constants)를 정의하는 파일이다.
 *
 * Target Role:
 * - engine 공통 상수의 공식 source file로 유지되어야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - 없음
 *
 * Outputs:
 * - shared constants
 *
 * Called From:
 * - src/lib/trip/* 전반
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
 * - 타입 파일(types.ts)과 함께 engine 기반 계약을 안정화한다.
 */
import type { Area, TimeBucket, UserVector } from "./types";

export const TIME_BUCKET_SLOTS: Record<TimeBucket, number[]> = {
  early_morning: [10, 11, 12, 13], // 05:00 ~ 07:00
  morning: [14, 15, 16, 17], // 07:00 ~ 09:00
  late_morning: [18, 19, 20, 21], // 09:00 ~ 11:00
  lunch: [22, 23, 24, 25], // 11:00 ~ 13:00
  afternoon: [26, 27, 28, 29, 30, 31, 32, 33], // 13:00 ~ 17:00
  sunset: [34, 35, 36, 37], // 17:00 ~ 19:00
  dinner: [38, 39, 40, 41], // 19:00 ~ 21:00
  night: [42, 43, 44, 45, 46, 47], // 21:00 ~ 24:00
};

export const AREA_DISTANCE_MINUTES: Record<Area, Record<Area, number>> = {
  hongdae: {
    hongdae: 10,
    seongsu: 45,
    itaewon: 35,
    hannam: 35,
    jongno: 30,
    ikseondong: 30,
    bukchon: 35,
    jamsil: 55,
    yeouido: 25,
    gangnam: 45,
    other: 40,
  },
  seongsu: {
    hongdae: 45,
    seongsu: 10,
    itaewon: 30,
    hannam: 25,
    jongno: 30,
    ikseondong: 35,
    bukchon: 35,
    jamsil: 25,
    yeouido: 45,
    gangnam: 25,
    other: 40,
  },
  itaewon: {
    hongdae: 35,
    seongsu: 30,
    itaewon: 10,
    hannam: 15,
    jongno: 25,
    ikseondong: 25,
    bukchon: 30,
    jamsil: 35,
    yeouido: 30,
    gangnam: 25,
    other: 40,
  },
  hannam: {
    hongdae: 35,
    seongsu: 25,
    itaewon: 15,
    hannam: 10,
    jongno: 25,
    ikseondong: 30,
    bukchon: 30,
    jamsil: 30,
    yeouido: 35,
    gangnam: 20,
    other: 40,
  },
  jongno: {
    hongdae: 30,
    seongsu: 30,
    itaewon: 25,
    hannam: 25,
    jongno: 10,
    ikseondong: 10,
    bukchon: 15,
    jamsil: 40,
    yeouido: 30,
    gangnam: 35,
    other: 40,
  },
  ikseondong: {
    hongdae: 30,
    seongsu: 35,
    itaewon: 25,
    hannam: 30,
    jongno: 10,
    ikseondong: 10,
    bukchon: 15,
    jamsil: 40,
    yeouido: 35,
    gangnam: 35,
    other: 40,
  },
  bukchon: {
    hongdae: 35,
    seongsu: 35,
    itaewon: 30,
    hannam: 30,
    jongno: 15,
    ikseondong: 15,
    bukchon: 10,
    jamsil: 45,
    yeouido: 35,
    gangnam: 40,
    other: 40,
  },
  jamsil: {
    hongdae: 55,
    seongsu: 25,
    itaewon: 35,
    hannam: 30,
    jongno: 40,
    ikseondong: 40,
    bukchon: 45,
    jamsil: 10,
    yeouido: 55,
    gangnam: 20,
    other: 40,
  },
  yeouido: {
    hongdae: 25,
    seongsu: 45,
    itaewon: 30,
    hannam: 35,
    jongno: 30,
    ikseondong: 35,
    bukchon: 35,
    jamsil: 55,
    yeouido: 10,
    gangnam: 40,
    other: 40,
  },
  gangnam: {
    hongdae: 45,
    seongsu: 25,
    itaewon: 25,
    hannam: 20,
    jongno: 35,
    ikseondong: 35,
    bukchon: 40,
    jamsil: 20,
    yeouido: 40,
    gangnam: 10,
    other: 40,
  },
  other: {
    hongdae: 40,
    seongsu: 40,
    itaewon: 40,
    hannam: 40,
    jongno: 40,
    ikseondong: 40,
    bukchon: 40,
    jamsil: 40,
    yeouido: 40,
    gangnam: 40,
    other: 10,
  },
};

export const DEFAULT_USER_VECTOR: UserVector = {
  food: 0.5,
  culture: 0.5,
  nature: 0.5,
  shopping: 0.5,
  entertainment: 0.5,

  quiet: 0.5,
  romantic: 0.5,
  local: 0.5,
  touristy: 0.5,
  luxury: 0.5,
  hipster: 0.5,
  traditional: 0.5,

  walkIntensity: 0.5,
  crowdLevel: 0.5,
  activityIntensity: 0.5,
  cost: 0.5,
};

export const DAILY_EXPERIENCE_COUNT_BY_DENSITY: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 3,
  2: 4,
  3: 4,
  4: 5,
  5: 5,
};
