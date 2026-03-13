"use client";

import {
  DENSITY,
  FOCUS_RING,
  MOTION,
  RADIUS,
  SHADOW,
  SPACE,
} from "@/lib/MOTION_TOKENS";

type Props = {
  onRetry?: () => void;
  onSave?: () => void;
  onShare?: () => void;
};

export default function TripActionsBar({
  onRetry,
  onSave,
  onShare,
}: Props) {
  const density = DENSITY.base;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: SPACE[10],
      }}
    >
      <div
        style={{
          display: "flex",
          gap: SPACE[10],
        }}
      >
        <button
          type="button"
          className="tp2-btn"
          style={{
            minHeight: density.buttonHeight,
            borderRadius: RADIUS.md,
            boxShadow: SHADOW.level1,
            transition: [
              `transform ${MOTION.duration.fast}ms ${MOTION.easing}`,
              `opacity ${MOTION.duration.base}ms ${MOTION.easing}`,
              `box-shadow ${MOTION.duration.base}ms ${MOTION.easing}`,
            ].join(", "),
          }}
          onClick={onSave}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow = `${SHADOW.level1}, ${FOCUS_RING.ring}`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = SHADOW.level1;
          }}
        >
          저장
        </button>

        <button
          type="button"
          className="tp2-btn"
          style={{
            minHeight: density.buttonHeight,
            borderRadius: RADIUS.md,
            boxShadow: SHADOW.level1,
            transition: [
              `transform ${MOTION.duration.fast}ms ${MOTION.easing}`,
              `opacity ${MOTION.duration.base}ms ${MOTION.easing}`,
              `box-shadow ${MOTION.duration.base}ms ${MOTION.easing}`,
            ].join(", "),
          }}
          onClick={onShare}
          onFocus={(e) => {
            e.currentTarget.style.boxShadow = `${SHADOW.level1}, ${FOCUS_RING.ring}`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.boxShadow = SHADOW.level1;
          }}
        >
          공유
        </button>
      </div>

      <button
        type="button"
        className="tp2-btnPrimary"
        style={{
          minHeight: density.buttonHeight,
          borderRadius: RADIUS.md,
          boxShadow: SHADOW.level1,
          transition: [
            `transform ${MOTION.duration.fast}ms ${MOTION.easing}`,
            `opacity ${MOTION.duration.base}ms ${MOTION.easing}`,
            `box-shadow ${MOTION.duration.base}ms ${MOTION.easing}`,
          ].join(", "),
        }}
        onClick={onRetry}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = `${SHADOW.level1}, ${FOCUS_RING.ring}`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = SHADOW.level1;
        }}
      >
        전체 일정 다시 생성
      </button>
    </div>
  );
}
