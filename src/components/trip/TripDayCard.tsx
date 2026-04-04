"use client";

import type { DayCardViewModel } from "@/lib/trip/viewModel";
import {
  COLORS,
  DENSITY,
  GLASS,
  RADIUS,
  SHADOW,
  SPACE,
  TYPE,
} from "@/lib/MOTION_TOKENS";
import TripPlaceRow from "./TripPlaceRow";

type Props = {
  dayPlan: DayCardViewModel;
};

function getThemeLabel(theme: DayPlan["theme"]) {
  if (theme === "food") return "food";
  if (theme === "culture") return "culture";
  if (theme === "nature") return "nature";
  if (theme === "shopping") return "shopping";
  if (theme === "activity") return "activity";
  if (theme === "atmosphere") return "atmosphere";
  return "tourism";
}

export default function TripDayCard({ dayPlan }: Props) {
  const density = DENSITY.base;

  const regionText =
    dayPlan.regions.length > 0 ? dayPlan.regions.join(" · ") : "지역 미정";

  const categoryText =
    dayPlan.categories.length > 0
      ? dayPlan.categories.join(" · ")
      : "카테고리 정보 없음";

  return (
    <section
      className="tp2-card"
      style={{
        padding: `${density.cardPadY}px ${density.cardPadX}px`,
        borderRadius: RADIUS.xl,
        background: GLASS.background,
        boxShadow: SHADOW.level2,
        border: GLASS.border,
      }}
    >
      <div
        className="tp2-cardHeader"
        style={{ marginBottom: SPACE[16] }}
      >
        <div
          style={{
            fontSize: TYPE.caption.size,
            lineHeight: TYPE.caption.lineHeight,
            fontWeight: TYPE.caption.weight,
            color: COLORS.muted,
            marginBottom: SPACE[8],
          }}
        >
          Day {dayPlan.day}
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: TYPE.h2.size,
            lineHeight: TYPE.h2.lineHeight,
            fontWeight: TYPE.h2.weight,
            color: COLORS.text,
          }}
        >
          {regionText}
        </h2>

        <p
          style={{
            marginTop: SPACE[10],
            marginBottom: 0,
            fontSize: TYPE.body.size,
            lineHeight: TYPE.body.lineHeight,
            fontWeight: TYPE.body.weight,
            color: COLORS.muted,
          }}
        >
          theme {getThemeLabel(dayPlan.theme)} · 총 예상 시간{" "}
          {dayPlan.total_estimated_duration_min}분
        </p>
      </div>

      <div
        className="tp2-wrapChips"
        style={{ marginTop: 0, marginBottom: SPACE[14] }}
      >
        <span className="tp2-chip">region {regionText}</span>
        <span className="tp2-chip">category {categoryText}</span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: density.rowGap,
        }}
      >
        {dayPlan.slottedPlaces.map((entry) => (
          <TripPlaceRow
            key={`${dayPlan.day}-${entry.slot}-${entry.item.place.id}`}
            entry={entry}
          />
        ))}
      </div>
    </section>
  );
}
