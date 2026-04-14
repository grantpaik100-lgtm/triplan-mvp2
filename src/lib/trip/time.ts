/**
 * TriPlan V3
 * Current Role:
 * - time bucket과 slot 변환, preferred start slot 계산, allowed time 검사 등을 담당하는 time helper file이다.
 *
 * Target Role:
 * - scheduling / planning에서 공통으로 사용하는 canonical time utility layer가 되어야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - time bucket
 * - allowed times
 * - minutes
 *
 * Outputs:
 * - slot number
 * - slot allowance boolean
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
 * - 외부 데이터 shape가 완전히 균일하지 않을 수 있으므로 항상 방어적으로 처리한다.
 */

import type { TimeBucket } from "./types";

const TIME_BUCKET_START_SLOT: Record<TimeBucket, number> = {
  early_morning: 12,
  morning: 16,
  late_morning: 20,
  lunch: 24,
  afternoon: 28,
  sunset: 34,
  dinner: 36,
  night: 40,
};

const TIME_BUCKET_SLOT_RANGES: Record<TimeBucket, number[]> = {
  early_morning: [12, 13, 14, 15],
  morning: [16, 17, 18, 19],
  late_morning: [20, 21, 22, 23],
  lunch: [24, 25, 26, 27],
  afternoon: [28, 29, 30, 31, 32, 33],
  sunset: [34, 35],
  dinner: [36, 37, 38, 39],
  night: [40, 41, 42, 43, 44, 45, 46, 47],
};

function isValidTimeBucket(value: unknown): value is TimeBucket {
  if (typeof value !== "string") return false;
  return value in TIME_BUCKET_SLOT_RANGES;
}

function normalizeAllowedTimes(allowedTimes: unknown): TimeBucket[] {
  if (!Array.isArray(allowedTimes)) return [];

  return allowedTimes.filter(isValidTimeBucket);
}

export function minutesToSlots(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 1;
  return Math.max(1, Math.ceil(minutes / 30));
}

export function getPreferredStartSlot(preferredTime?: TimeBucket | null): number {
  if (!preferredTime || !isValidTimeBucket(preferredTime)) {
    return TIME_BUCKET_START_SLOT.afternoon;
  }

  return TIME_BUCKET_START_SLOT[preferredTime];
}

export function isAllowedTimeSlot(
  allowedTimes: TimeBucket[] | string[] | null | undefined,
  slot: number,
): boolean {
  const safeAllowedTimes = normalizeAllowedTimes(allowedTimes);

  if (safeAllowedTimes.length === 0) {
    return true;
  }

  return safeAllowedTimes.some((bucket) => {
    const slots = TIME_BUCKET_SLOT_RANGES[bucket] ?? [];
    return slots.includes(slot);
  });
}
