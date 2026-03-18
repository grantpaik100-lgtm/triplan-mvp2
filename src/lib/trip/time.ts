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
