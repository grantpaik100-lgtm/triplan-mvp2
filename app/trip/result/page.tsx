"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TripPlanResult } from "@/engine/types";
import {
  COLORS,
  DENSITY,
  GLASS,
  MAXWIDTH,
  MOTION,
  RADIUS,
  SHADOW,
  SPACE,
  TYPE,
} from "@/lib/MOTION_TOKENS";
import TripActionsBar from "@/components/trip/TripActionsBar";
import TripDayCard from "@/components/trip/TripDayCard";
import TripSummaryCard from "@/components/trip/TripSummaryCard";

type ApiResponse = {
  marker?: string;
  result?: TripPlanResult;
};



export default function TripResultPage() {
  const density = DENSITY.base;
  const [result, setResult] = useState<TripPlanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageStyle = useMemo(
    () => ({
      minHeight: "100svh",
      background: `linear-gradient(180deg, ${COLORS.sky1} 0%, ${COLORS.sky2} 100%)`,
      padding: SPACE[18],
    }),
    []
  );

  const shellStyle = useMemo(
    () => ({
      width: "100%",
      maxWidth: MAXWIDTH.itinerary,
      margin: "0 auto",
      display: "flex",
      flexDirection: "column" as const,
      gap: SPACE[16],
    }),
    []
  );

  const appearStyle = useMemo(
    () => ({
      animationDuration: `${MOTION.duration.page}ms`,
      animationTimingFunction: MOTION.easing,
      animationFillMode: "both" as const,
      animationName: "tpTripFadeIn",
    }),
    []
  );

   const fetchTrip = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/generatetrip", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }

      const data = (await response.json()) as ApiResponse;

      if (!data.result) {
        throw new Error("결과가 비어 있습니다.");
      }

      setResult(data.result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "일정 생성 중 오류가 발생했습니다.";
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTrip();
  }, [fetchTrip]);

  return (
    <main style={pageStyle}>
      <style>{`
        @keyframes tpTripFadeIn {
          from {
            opacity: ${MOTION.enter.from.opacity};
            transform: scale(${MOTION.enter.from.scale});
            filter: blur(${MOTION.enter.from.blurPx}px);
          }
          to {
            opacity: ${MOTION.enter.to.opacity};
            transform: scale(${MOTION.enter.to.scale});
            filter: blur(${MOTION.enter.to.blurPx}px);
          }
        }
      `}</style>

      <div style={shellStyle}>
        {loading ? (
          <section
            className="tp2-card"
            style={{
              ...appearStyle,
              padding: `${density.cardPadY}px ${density.cardPadX}px`,
              borderRadius: RADIUS.xl,
              background: GLASS.background,
              border: GLASS.border,
              boxShadow: SHADOW.level2,
              textAlign: "center" as const,
            }}
          >
            <div
              style={{
                fontSize: TYPE.h2.size,
                lineHeight: TYPE.h2.lineHeight,
                fontWeight: TYPE.h2.weight,
                color: COLORS.text,
                marginBottom: SPACE[10],
              }}
            >
              일정을 생성하는 중
            </div>

            <p
              style={{
                margin: 0,
                fontSize: TYPE.body.size,
                lineHeight: TYPE.body.lineHeight,
                fontWeight: TYPE.body.weight,
                color: COLORS.muted,
              }}
            >
              설문 성향과 여행 제약을 바탕으로 초안을 만들고 있다.
            </p>

            <div className="tp-spinner" />
          </section>
        ) : error ? (
          <section
            className="tp2-card"
            style={{
              ...appearStyle,
              padding: `${density.cardPadY}px ${density.cardPadX}px`,
              borderRadius: RADIUS.xl,
              background: GLASS.background,
              border: GLASS.border,
              boxShadow: SHADOW.level2,
            }}
          >
            <div
              style={{
                fontSize: TYPE.h2.size,
                lineHeight: TYPE.h2.lineHeight,
                fontWeight: TYPE.h2.weight,
                color: COLORS.text,
                marginBottom: SPACE[10],
              }}
            >
              결과를 불러오지 못했다
            </div>

            <p
              style={{
                marginTop: 0,
                marginBottom: SPACE[16],
                fontSize: TYPE.body.size,
                lineHeight: TYPE.body.lineHeight,
                fontWeight: TYPE.body.weight,
                color: COLORS.muted,
              }}
            >
              {error}
            </p>

            <TripActionsBar onRetry={fetchTrip} />
          </section>
        ) : result ? (
          <>
            <div style={appearStyle}>
              <TripSummaryCard result={result} />
            </div>

            {result.schedule.map((dayPlan, index) => (
              <div
                key={dayPlan.day}
                style={{
                  ...appearStyle,
                  animationDelay: `${index * MOTION.duration.fast}ms`,
                }}
              >
                <TripDayCard dayPlan={dayPlan} />
              </div>
            ))}

            <div style={appearStyle}>
              <TripActionsBar onRetry={fetchTrip} />
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
