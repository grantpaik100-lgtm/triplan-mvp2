/**
 * TriPlan V3
 * Current Role:
 * - tripResult를 storage에서 읽고 viewModel을 거쳐 최종 결과 UI를 렌더링하는 결과 route file이다.
 *
 * Target Role:
 * - generated trip result의 공식 route-level renderer로 유지되어야 한다.
 *
 * Chain:
 * - result
 *
 * Inputs:
 * - sessionStorage trip result
 *
 * Outputs:
 * - result page rendering
 *
 * Called From:
 * - /trip/result route
 * - generate 완료 후 navigation
 *
 * Side Effects:
 * - sessionStorage read
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
 * - result rendering과 engine output contract가 만나는 경계 파일이다.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import TripSummaryCard from "@/components/trip/TripSummaryCard";
import TripDayCard from "@/components/trip/TripDayCard";
import type { TripPlanResult } from "@/lib/trip/types";
import {
  toSummaryViewModel,
  toDayCardViewModel,
} from "@/lib/trip/viewModel";

export default function TripResultPage() {
  const [loading, setLoading] = useState(true);
  const [tripResult, setTripResult] = useState<TripPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw =
        sessionStorage.getItem("tripResult") ??
        sessionStorage.getItem("triplan_trip_result");

      if (!raw) {
        setError("저장된 여행 결과가 없습니다.");
        setLoading(false);
        return;
      }

      const parsed = JSON.parse(raw) as TripPlanResult;
      setTripResult(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const summary = useMemo(() => {
    if (!tripResult) return null;
    return toSummaryViewModel(tripResult);
  }, [tripResult]);

  if (loading) {
    return <div style={{ padding: 24 }}>결과를 불러오는 중...</div>;
  }

  if (error) {
    return <div style={{ padding: 24 }}>오류: {error}</div>;
  }

  if (!tripResult) {
    return <div style={{ padding: 24 }}>결과가 없습니다.</div>;
  }

  return (
    <main style={{ padding: 24 }}>
      {summary && <TripSummaryCard summary={summary} />}

      <div style={{ height: 24 }} />

      {tripResult.debug.schedulingDiagnostics.days.length > 0 && (
        <section
          style={{
            marginBottom: 24,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16,
            padding: 16,
          }}
        >
          <p style={{ fontSize: 12, opacity: 0.6, letterSpacing: "0.18em" }}>
            SCHEDULING V2 DIAGNOSTICS
          </p>

          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {tripResult.debug.schedulingDiagnostics.days.map((diag) => (
              <div
                key={diag.dayIndex}
                style={{
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  DAY {diag.dayIndex}
                </div>

                <div style={{ fontSize: 14, lineHeight: 1.8 }}>
                  <div>narrative: {diag.narrativeType}</div>
                  <div>primary peak: {diag.primaryPeakId ?? "none"}</div>
                  <div>
                    flow score: {diag.flowScoreBeforeRepair} → {diag.flowScoreAfterRepair}
                  </div>
                  <div>overflow: {diag.overflowMin} min</div>
                  <div>status: {diag.finalStatus}</div>
                </div>

                {diag.notes.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                    {diag.notes.map((note, idx) => (
                      <div key={idx}>• {note}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {tripResult.dayPlans.map((dayPlan, index) => {
        const schedule = tripResult.schedules[index];
        if (!schedule) return null;

        const dayCard = toDayCardViewModel(dayPlan, schedule);

        return (
          <div key={dayPlan.day} style={{ marginBottom: 24 }}>
            <TripDayCard dayPlan={dayCard} />
          </div>
        );
      })}
    </main>
  );
}
