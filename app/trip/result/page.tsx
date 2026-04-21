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
 * - planning/scheduling diagnostics 렌더링
 * - compare 포맷 자동 출력 (복사용)
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
 * - Scheduling V2 diagnostics와 Planning Contract(묶음 A) diagnostics를 함께 노출한다.
 * - compare 포맷 블록은 dev 분석용 — 복사 버튼으로 전체 긁어올 수 있다.
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

/**
 * compare 포맷 텍스트 블록 생성.
 * dev에서 붙여넣기 용도이므로 plain text로 뽑는다.
 */
function buildCompareText(tripResult: TripPlanResult): string {
  const scheduling = tripResult.debug?.schedulingDiagnostics;
  const planning = tripResult.debug?.planningDiagnostics;

  const lines: string[] = [];
  lines.push("TRIPLAN RESULT COMPARE");

  // summary
  const totalDays = tripResult.dayPlans.length;
  const repairCount = scheduling?.totalRepairCount ?? 0;
  const overflowDays = scheduling?.totalOverflowDays ?? 0;

  const statusCounts: Record<string, number> = {};
  scheduling?.days?.forEach((d) => {
    statusCounts[d.finalStatus] = (statusCounts[d.finalStatus] ?? 0) + 1;
  });
  const statusStr = Object.entries(statusCounts)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");

  lines.push(`totalDays=${totalDays}`);
  lines.push(`repairCount=${repairCount}`);
  lines.push(`overflowDays=${overflowDays}`);
  lines.push(`statusCounts=${statusStr}`);

  // day summary lines
  scheduling?.days?.forEach((d) => {
    const dayPlan = tripResult.dayPlans[d.dayIndex - 1];
    const planned = dayPlan
      ? dayPlan.anchor.length + dayPlan.core.length + dayPlan.optional.length
      : 0;
    const schedule = tripResult.schedules[d.dayIndex - 1];
    const scheduled = schedule?.items?.length ?? 0;
    lines.push(
      `DAY ${d.dayIndex} | ${d.narrativeType} | skeleton=${d.skeletonType} | plannedItems=${planned} | scheduledItems=${scheduled} | recovery=${d.primaryRecoveryId ?? "none"} | status=${d.finalStatus}`,
    );
  });

  // each day diagnostics
  scheduling?.days?.forEach((d) => {
    lines.push("");
    lines.push(`DAY ${d.dayIndex} SCHEDULING DIAGNOSTICS`);
    lines.push(`narrative=${d.narrativeType}`);
    lines.push(`primaryPeak=${d.primaryPeakId ?? "none"}`);
    lines.push(`flow=${d.flowScoreBeforeRepair} -> ${d.flowScoreAfterRepair}`);
    lines.push(`overflow=${d.overflowMin}`);
    lines.push(`finalStatus=${d.finalStatus}`);

    d.repairs?.forEach((r) => {
      lines.push(
        `repair.step=${r.step} action=${r.action}${r.targetExperienceId ? ` target=${r.targetExperienceId}` : ""}`,
      );
    });

    d.notes?.forEach((n) => lines.push(`note=${n}`));

    // PLANNING DIAGNOSTICS (묶음 A — PlanningContract observation)
    const planDay = planning?.dayPlans?.find((p) => p.dayIndex === d.dayIndex);
    if (planDay) {
      lines.push("");
      lines.push(`DAY ${d.dayIndex} PLANNING DIAGNOSTICS`);
      lines.push(`targetStrategy=${planDay.targetClusterStrategy}`);
      lines.push(`totalScore=${planDay.totalScore}`);
      lines.push(`anchorIds=${planDay.anchorIds.join(",") || "none"}`);
      lines.push(`coreIds=${planDay.coreIds.join(",") || "none"}`);
      lines.push(`optionalIds=${planDay.optionalIds.join(",") || "none"}`);
      planDay.notes?.forEach((n) => lines.push(`pnote=${n}`));
    }
    lines.push("-".repeat(50));
  });

  return lines.join("\n");
}

function CopyButton({ getText }: { getText: () => string }) {
  const [label, setLabel] = useState("copy");
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(getText());
      setLabel("copied!");
      setTimeout(() => setLabel("copy"), 1500);
    } catch {
      setLabel("fail");
      setTimeout(() => setLabel("copy"), 1500);
    }
  }
  return (
    <button
      onClick={handleCopy}
      style={{
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.2)",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

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

  const compareText = useMemo(() => {
    if (!tripResult) return "";
    return buildCompareText(tripResult);
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

      {/* COMPARE TEXT BLOCK — dev 복사용 */}
      <section
        style={{
          marginBottom: 24,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <p style={{ fontSize: 12, opacity: 0.6, letterSpacing: "0.18em" }}>
            COMPARE TEXT (DEV)
          </p>
          <CopyButton getText={() => compareText} />
        </div>
        <pre
          style={{
            fontSize: 11,
            lineHeight: 1.5,
            margin: 0,
            padding: 12,
            background: "rgba(0,0,0,0.3)",
            borderRadius: 8,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {compareText}
        </pre>
      </section>

      {/* SCHEDULING DIAGNOSTICS */}
      {tripResult.debug?.schedulingDiagnostics?.days?.length > 0 && (
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

                {diag.repairs?.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    <div style={{ marginBottom: 4, fontWeight: 600 }}>repairs</div>
                    {diag.repairs.map((repair, idx) => (
                      <div key={idx}>
                        • step {repair.step}: {repair.action}
                        {repair.targetExperienceId ? ` (${repair.targetExperienceId})` : ""}
                      </div>
                    ))}
                  </div>
                )}

                {diag.notes?.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                    <div style={{ marginBottom: 4, fontWeight: 600 }}>notes</div>
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

      {/* PLANNING DIAGNOSTICS (묶음 A — PlanningContract observation) */}
      {tripResult.debug?.planningDiagnostics?.dayPlans?.length > 0 && (
        <section
          style={{
            marginBottom: 24,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16,
            padding: 16,
          }}
        >
          <p style={{ fontSize: 12, opacity: 0.6, letterSpacing: "0.18em" }}>
            PLANNING DIAGNOSTICS (CONTRACT OBSERVATION)
          </p>

          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              opacity: 0.8,
              lineHeight: 1.8,
            }}
          >
            <div>diversityMode: {tripResult.debug.planningDiagnostics.diversityMode}</div>
            <div>totalAnchors: {tripResult.debug.planningDiagnostics.totalAnchors}</div>
            <div>totalCore: {tripResult.debug.planningDiagnostics.totalCore}</div>
            <div>totalOptional: {tripResult.debug.planningDiagnostics.totalOptional}</div>
          </div>

          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {tripResult.debug.planningDiagnostics.dayPlans.map((diag) => (
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
                  <div>strategy: {diag.targetClusterStrategy}</div>
                  <div>skeleton: {diag.skeletonType ?? "none"}</div>
                  <div>totalScore: {diag.totalScore.toFixed(2)}</div>
                  <div>
                    items: anchor[{diag.anchorIds.length}] core[{diag.coreIds.length}] optional[
                    {diag.optionalIds.length}]
                  </div>
                  <div>peakCandidate: {diag.peakCandidateId ?? "none"}</div>
                  <div>recoveryCandidate: {diag.recoveryCandidateId ?? "none"}</div>
                </div>

                {diag.notes?.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                    <div style={{ marginBottom: 4, fontWeight: 600 }}>notes</div>
                    {diag.notes.map((note, idx) => (
                      <div
                        key={idx}
                        style={{
                          wordBreak: "break-word",
                          marginBottom: 2,
                        }}
                      >
                        • {note}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TRIP DAY CARDS */}
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
