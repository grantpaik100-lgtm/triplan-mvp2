"use client";

import type { PlaceRowViewModel } from "@/lib/trip/viewModel";
import {
  COLORS,
  DENSITY,
  FOCUS_RING,
  GLASS,
  MOTION,
  RADIUS,
  SHADOW,
  SPACE,
  TYPE,
} from "@/lib/MOTION_TOKENS";

type Props = {
  entry: PlaceRowViewModel;
};

function getSlotLabel(slot: SlottedPlace["slot"]) {
  if (slot === "morning") return "morning";
  if (slot === "midday") return "midday";
  if (slot === "afternoon") return "afternoon";
  return "evening";
}

function getDurationLabel(value: number | null) {
  if (!value) return "예상시간 미정";
  return `${value}분`;
}

export default function TripPlaceRow({ entry }: Props) {
  const density = DENSITY.base;
  const { item, slot } = entry;
  const place = item.place;

  return (
    <div
      className="tp2-subcard"
      style={{
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.level1,
        padding: SPACE[14],
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: SPACE[12],
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: density.chipHeight,
              padding: `0 ${SPACE[12]}px`,
              borderRadius: RADIUS.pill,
              background: "rgba(255,255,255,0.88)",
              border: GLASS.border,
              boxShadow: SHADOW.level1,
              fontSize: TYPE.caption.size,
              lineHeight: TYPE.caption.lineHeight,
              fontWeight: TYPE.caption.weight,
              color: COLORS.muted,
              marginBottom: SPACE[10],
            }}
          >
            {getSlotLabel(slot)}
          </div>

          <div
            style={{
              fontSize: TYPE.title.size,
              lineHeight: TYPE.title.lineHeight,
              fontWeight: TYPE.title.weight,
              color: COLORS.text,
              marginBottom: SPACE[6],
              wordBreak: "keep-all",
            }}
          >
            {place.name}
          </div>

          <div
            style={{
              fontSize: TYPE.body.size,
              lineHeight: TYPE.body.lineHeight,
              fontWeight: TYPE.body.weight,
              color: COLORS.muted,
              marginBottom: SPACE[8],
            }}
          >
            {(place.category ?? "카테고리 없음")} · {(place.region ?? "지역 없음")} ·{" "}
            {getDurationLabel(place.avg_duration_min)}
          </div>

          <div
            style={{
              fontSize: TYPE.caption.size,
              lineHeight: TYPE.caption.lineHeight,
              fontWeight: TYPE.caption.weight,
              color: COLORS.muted,
            }}
          >
            추천 점수 {item.score.toFixed(2)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: SPACE[8],
            minWidth: 92,
          }}
        >
          <button
            type="button"
            className="tp2-btn"
            style={{
              minHeight: density.buttonHeight,
              borderRadius: RADIUS.md,
              transition: [
                `transform ${MOTION.duration.fast}ms ${MOTION.easing}`,
                `opacity ${MOTION.duration.base}ms ${MOTION.easing}`,
                `box-shadow ${MOTION.duration.base}ms ${MOTION.easing}`,
              ].join(", "),
              boxShadow: SHADOW.level1,
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = `${SHADOW.level1}, ${FOCUS_RING.ring}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = SHADOW.level1;
            }}
          >
            교체
          </button>

          <button
            type="button"
            className="tp2-btn"
            style={{
              minHeight: density.buttonHeight,
              borderRadius: RADIUS.md,
              transition: [
                `transform ${MOTION.duration.fast}ms ${MOTION.easing}`,
                `opacity ${MOTION.duration.base}ms ${MOTION.easing}`,
                `box-shadow ${MOTION.duration.base}ms ${MOTION.easing}`,
              ].join(", "),
              boxShadow: SHADOW.level1,
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = `${SHADOW.level1}, ${FOCUS_RING.ring}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = SHADOW.level1;
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
