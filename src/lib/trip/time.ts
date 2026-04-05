/**
 * TriPlan V3
 * Current Role:
 * - slot/time bucket 변환, 시간대 계산, duration 보조 로직을 담당하는 파일이다.
 *
 * Target Role:
 * - planning/scheduling에서 사용하는 공식 시간 계산 helper로 유지되어야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - slot / time bucket / duration values
 *
 * Outputs:
 * - time conversion / helper results
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
 * - scheduling 엔진 재설계 시 같이 검토해야 할 파일이다.
 */

import { TIME_BUCKET_SLOTS } from "./constants";
import type { TimeBucket } from "./types";

export function slotToTimeString(slot: number): string {
  const totalMinutes = slot * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function minutesToSlots(minutes: number): number {
  return Math.ceil(minutes / 30);
}

export function bucketContainsSlot(bucket: TimeBucket, slot: number): boolean {
  return TIME_BUCKET_SLOTS[bucket].includes(slot);
}

export function isAllowedTimeSlot(allowed: TimeBucket[], slot: number): boolean {
  return allowed.some((bucket) => bucketContainsSlot(bucket, slot));
}

export function getPreferredStartSlot(bucket: TimeBucket): number {
  const slots = TIME_BUCKET_SLOTS[bucket];
  return slots[Math.floor(slots.length / 2)];
}
