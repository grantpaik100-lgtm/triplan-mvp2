"use client";
/**
 * TriPlan V4
 * Current Role:
 * - dev scenario를 선택해 sessionStorage에 canonical input을 주입하고 generate 체인으로 보내는 내부 테스트 route다.
 * - scenario compare 출력에서 planning / scheduling / schedulingPreview diagnostics를 확인한다.
 *
 * Target Role:
 * - 단일 scenario 실행과 다중 scenario 비교 실행을 모두 지원하는 공식 dev scenario runner.
 * - Scheduling Preview 결과를 dev output에서 검증할 수 있어야 한다.
 *
 * Chain:
 * - generate
 *
 * Inputs:
 * - scenario name
 *
 * Outputs:
 * - sessionStorage.triplan_primary_result
 * - sessionStorage.triplan_planning_input
 * - /trip/generate navigation
 * - compare diagnostics UI
 *
 * Called From:
 * - /dev/scenario route
 *
 * Side Effects:
 * - sessionStorage write
 * - fetch
 * - navigation
 * - clipboard write
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
 * - dev/internal route다.
 * - 사용자용 설문 체인을 대체하지 않는다.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getScenarioNames, loadScenario } from "@/lib/trip/scenarioLoader";
import type { TripPlanResult } from "@/lib/trip/types";

type RunnerStatus = "idle" | "running" | "success" | "error";

type ScenarioRunResult = {
  name: string;
  status: RunnerStatus;
  durationMs?: number;
  result?: TripPlanResult;
  error?: string;
};

function buildSecondaryAnswersFromStoredInput(stored: any) {
  const rawAnswers = stored?.raw?.surveyRawAnswers ?? {};

  return {
    ...rawAnswers,
    tripDays: rawAnswers.tripDays,
    companionType:
      rawAnswers.companionType ??
      stored?.context?.companionDynamic ??
      rawAnswers.companion,
    firstDayStart: rawAnswers.firstDayStart,
    lastDayEnd: rawAnswers.lastDayEnd,
    pace: rawAnswers.pace ?? stored?.softPreferences?.pace,
    diversityMode: rawAnswers.diversityMode ?? rawAnswers.diversity_mode,
  };
}

function countNotesContaining(result: TripPlanResult, keyword: string) {
  return (
    result.debug?.schedulingDiagnostics?.days?.reduce((sum, day) => {
      const matches =
        day.notes?.filter((note) => note.includes(keyword)).length ?? 0;
      return sum + matches;
    }, 0) ?? 0
  );
}

function getStatusCounts(result: TripPlanResult) {
  const days = result.debug?.schedulingDiagnostics?.days ?? [];

  return days.reduce(
    (acc, day) => {
      const key = day.finalStatus;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

function countPlanningBudgetInfeasible(result: TripPlanResult) {
  return (
    result.debug?.planningDiagnostics?.dayPlans?.reduce((sum, day) => {
      const hasInfeasible =
        day.notes?.some((note) => note === "budgetFeasible=false") ?? false;
      return sum + (hasInfeasible ? 1 : 0);
    }, 0) ?? 0
  );
}

function getPreviewStatusCounts(result: TripPlanResult) {
  const previewDays = result.debug?.schedulingPreview?.days ?? [];

  return previewDays.reduce(
    (acc, day) => {
      acc[day.status] = (acc[day.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

function buildScenarioSummary(result: TripPlanResult) {
  const scheduling = result.debug?.schedulingDiagnostics;
  const days = scheduling?.days ?? [];
  const statusCounts = getStatusCounts(result);

  return {
    totalRepairs: scheduling?.totalRepairCount ?? 0,
    overflowDays: scheduling?.totalOverflowDays ?? 0,
    missingRecoveryCount: countNotesContaining(result, "after:missing_recovery"),
    lateFallbackMissCount: countNotesContaining(result, "lateFallbackMiss="),
    timeWindowViolationCount: countNotesContaining(
      result,
      "issues=time_window_violation",
    ),
    softMissCount: countNotesContaining(result, "timeline:softMiss="),
    planningInfeasibleDays: countPlanningBudgetInfeasible(result),
    previewConflictDays:
      result.debug?.schedulingPreview?.diagnostics?.conflictDays ?? 0,
    previewTotalConflicts:
      result.debug?.schedulingPreview?.diagnostics?.totalConflictCount ?? 0,
    previewStatusCounts: getPreviewStatusCounts(result),
    statusCounts,
    dayLines: days.map((day) => {
      const plannedItemsNote =
        day.notes?.find((note) => note.startsWith("plannedItems=")) ??
        "plannedItems=unknown";
      const scheduledItemsNote =
        day.notes?.find((note) => note.startsWith("scheduledItems=")) ??
        "scheduledItems=unknown";
      const skeletonNote =
        day.notes?.find((note) => note.startsWith("skeleton=")) ??
        "skeleton=unknown";
      const recoveryNote =
        day.notes?.find((note) => note.startsWith("recovery=")) ??
        "recovery=none";

      return `DAY ${day.dayIndex} | ${day.narrativeType} | ${skeletonNote} | ${plannedItemsNote} | ${scheduledItemsNote} | ${recoveryNote} | status=${day.finalStatus}`;
    }),
  };
}

function buildCopyText(results: ScenarioRunResult[]) {
  const lines: string[] = [];

  lines.push("TRIPLAN DEV SCENARIO COMPARE");
  lines.push("");

  for (const item of results) {
    lines.push(`SCENARIO: ${item.name}`);
    lines.push(`status=${item.status}`);

    if (item.durationMs != null) {
      lines.push(`durationMs=${item.durationMs}`);
    }

    if (item.error) {
      lines.push(`error=${item.error}`);
      lines.push("");
      continue;
    }

    if (!item.result) {
      lines.push("result=none");
      lines.push("");
      continue;
    }

    const summary = buildScenarioSummary(item.result);

    lines.push(`repairCount=${summary.totalRepairs}`);
    lines.push(`overflowDays=${summary.overflowDays}`);
    lines.push(`missingRecoveryCount=${summary.missingRecoveryCount}`);
    lines.push(`lateFallbackMissCount=${summary.lateFallbackMissCount}`);
    lines.push(`softMissCount=${summary.softMissCount}`);
    lines.push(`timeWindowViolationCount=${summary.timeWindowViolationCount}`);
    lines.push(`planningInfeasibleDays=${summary.planningInfeasibleDays}`);
    lines.push(`previewConflictDays=${summary.previewConflictDays}`);
    lines.push(`previewTotalConflicts=${summary.previewTotalConflicts}`);
    lines.push(
      `previewStatusCounts=${
        Object.entries(summary.previewStatusCounts)
          .map(([key, value]) => `${key}:${value}`)
          .join(", ") || "none"
      }`,
    );
    lines.push(
      `statusCounts=${
        Object.entries(summary.statusCounts)
          .map(([key, value]) => `${key}:${value}`)
          .join(", ") || "none"
      }`,
    );

    for (const dayLine of summary.dayLines) {
      lines.push(dayLine);
    }

    lines.push("");

    const schedulingDays = item.result.debug?.schedulingDiagnostics?.days ?? [];
    const planningDays = item.result.debug?.planningDiagnostics?.dayPlans ?? [];
    const previewDays = item.result.debug?.schedulingPreview?.days ?? [];

    for (const day of schedulingDays) {
      lines.push(`DAY ${day.dayIndex} SCHEDULING DIAGNOSTICS`);
      lines.push(`narrative=${day.narrativeType}`);
      lines.push(`primaryPeak=${day.primaryPeakId ?? "none"}`);
      lines.push(`flow=${day.flowScoreBeforeRepair} -> ${day.flowScoreAfterRepair}`);
      lines.push(`overflow=${day.overflowMin}`);
      lines.push(`finalStatus=${day.finalStatus}`);

      if (day.repairs?.length) {
        for (const repair of day.repairs) {
          lines.push(
            `repair.step=${repair.step} action=${repair.action}${
              repair.targetExperienceId ? ` target=${repair.targetExperienceId}` : ""
            }`,
          );
        }
      }

      if (day.notes?.length) {
        for (const note of day.notes) {
          lines.push(`note=${note}`);
        }
      }

      lines.push("");

      const planDay = planningDays.find((p) => p.dayIndex === day.dayIndex);

      if (planDay) {
        lines.push(`DAY ${day.dayIndex} PLANNING DIAGNOSTICS`);
        lines.push(`strategy=${planDay.targetClusterStrategy}`);
        lines.push(`skeleton=${planDay.skeletonType ?? "none"}`);
        lines.push(`totalScore=${planDay.totalScore}`);
        lines.push(`anchorIds=${planDay.anchorIds.join(",") || "none"}`);
        lines.push(`coreIds=${planDay.coreIds.join(",") || "none"}`);
        lines.push(`optionalIds=${planDay.optionalIds.join(",") || "none"}`);
        lines.push(`peakCandidateId=${planDay.peakCandidateId ?? "none"}`);
        lines.push(`recoveryCandidateId=${planDay.recoveryCandidateId ?? "none"}`);

        if (planDay.notes?.length) {
          for (const note of planDay.notes) {
            lines.push(`pnote=${note}`);
          }
        }

        lines.push("");
      }

      const previewDay = previewDays.find((p) => p.dayIndex === day.dayIndex);

      if (previewDay) {
        lines.push(`DAY ${day.dayIndex} SCHEDULING PREVIEW`);
        lines.push(`previewStatus=${previewDay.status}`);
        lines.push(`previewFeasibility=${previewDay.feasibility}`);
        lines.push(
          `selectedOptionIds=${previewDay.selectedOptionIds.join(",") || "none"}`,
        );
        lines.push(
          `selectedExperienceIds=${
            previewDay.selectedExperienceIds.join(",") || "none"
          }`,
        );
        lines.push(
          `estimatedTotalMinutes=${previewDay.analysis.estimatedTotalMinutes}`,
        );
        lines.push(`availableMinutes=${previewDay.analysis.availableMinutes}`);
        lines.push(
          `estimatedTravelMinutes=${previewDay.analysis.estimatedTravelMinutes}`,
        );
        lines.push(`estimatedFatigue=${previewDay.analysis.estimatedFatigue}`);
        lines.push(`bufferMinutes=${previewDay.analysis.bufferMinutes}`);
        lines.push(`previewSummary=${previewDay.analysis.summary}`);

        if (previewDay.conflicts.length) {
          for (const conflict of previewDay.conflicts) {
            lines.push(
              `previewConflict=${conflict.type} severity=${conflict.severity} message=${conflict.message}`,
            );
          }
        }

        if (previewDay.tradeOffs.length) {
          for (const tradeOff of previewDay.tradeOffs) {
            lines.push(`previewTradeOff=${tradeOff}`);
          }
        }

        if (previewDay.alternatives.length) {
          for (const alternative of previewDay.alternatives) {
            lines.push(
              `previewAlternative=${alternative.id} title=${alternative.title}`,
            );
          }
        }

        lines.push("");
      }
    }

    lines.push("--------------------------------------------------");
    lines.push("");
  }

  return lines.join("\n");
}

async function runScenarioByName(name: string): Promise<ScenarioRunResult> {
  const scenario = loadScenario(name);

  const primaryResult = {
    ...scenario.primaryResult,
    completedAt: new Date().toISOString(),
    source: "dev_scenario",
    scenarioName: scenario.name,
  };

  const planningInput = {
    ...scenario.planningInput,
    source: "dev_scenario",
    scenarioName: scenario.name,
  };

  const secondaryAnswers = buildSecondaryAnswersFromStoredInput(planningInput);
  const startedAt = performance.now();

  try {
    const response = await fetch("/api/generate-trip", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        primaryResult,
        planningInput,
        secondaryAnswers,
      }),
    });

    const data = await response.json();
    const durationMs = Math.round(performance.now() - startedAt);

    if (!response.ok || !data.ok) {
      return {
        name,
        status: "error",
        durationMs,
        error: data.error ?? "Failed to generate trip",
      };
    }

    return {
      name,
      status: "success",
      durationMs,
      result: data.result as TripPlanResult,
    };
  } catch (error) {
    return {
      name,
      status: "error",
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export default function DevScenarioPage() {
  const router = useRouter();
  const names = getScenarioNames();

  const [selected, setSelected] = useState(names[0] ?? "");
  const [compareResults, setCompareResults] = useState<ScenarioRunResult[]>([]);
  const [runningAll, setRunningAll] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  function handleRunSingle() {
    const scenario = loadScenario(selected);

    const primaryResult = {
      ...scenario.primaryResult,
      completedAt: new Date().toISOString(),
      source: "dev_scenario",
      scenarioName: scenario.name,
    };

    const planningInput = {
      ...scenario.planningInput,
      source: "dev_scenario",
      scenarioName: scenario.name,
    };

    sessionStorage.setItem("triplan_primary_result", JSON.stringify(primaryResult));
    sessionStorage.setItem("primaryResult", JSON.stringify(primaryResult));
    sessionStorage.setItem("triplan_planning_input", JSON.stringify(planningInput));

    router.push("/trip/generate");
  }

  async function handleRunAll() {
    setRunningAll(true);
    setCopyState("idle");

    const initial = names.map((name) => ({
      name,
      status: "running" as RunnerStatus,
    }));

    setCompareResults(initial);

    const nextResults: ScenarioRunResult[] = [];

    for (const name of names) {
      const result = await runScenarioByName(name);
      nextResults.push(result);
      setCompareResults([...nextResults]);
    }

    try {
      sessionStorage.setItem(
        "triplan_dev_compare_results",
        JSON.stringify(nextResults),
      );
    } catch {
      // dev helper storage failure는 무시
    }

    setRunningAll(false);
  }

  async function handleCopy() {
    try {
      const text = buildCopyText(compareResults);
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const compareText = useMemo(
    () => buildCopyText(compareResults),
    [compareResults],
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px",
        background: "#0b0f14",
        color: "white",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gap: 20,
        }}
      >
        <section
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 16,
            padding: 16,
            background: "rgba(255,255,255,0.03)",
            position: "sticky",
            top: 16,
            zIndex: 10,
            backdropFilter: "blur(8px)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>
            TriPlan Dev Scenario Runner
          </h1>

          <p style={{ marginTop: 8, opacity: 0.72 }}>
            설문 없이 scenario JSON으로 바로 generate/result까지 실행하고,
            compare output에서 scheduling preview까지 확인한다.
          </p>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={{
                minWidth: 280,
                padding: "10px 12px",
                borderRadius: 10,
                background: "#111827",
                color: "white",
                border: "1px solid rgba(255,255,255,0.16)",
              }}
            >
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <button
              onClick={handleRunSingle}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "#1f2937",
                color: "white",
                cursor: "pointer",
              }}
            >
              Run selected
            </button>

            <button
              onClick={handleRunAll}
              disabled={runningAll}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: runningAll ? "#374151" : "#2563eb",
                color: "white",
                cursor: runningAll ? "default" : "pointer",
              }}
            >
              {runningAll ? "Running all..." : "Run all scenarios"}
            </button>

            <button
              onClick={handleCopy}
              disabled={compareResults.length === 0}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: compareResults.length === 0 ? "#374151" : "#059669",
                color: "white",
                cursor: compareResults.length === 0 ? "default" : "pointer",
              }}
            >
              Copy diagnostics text
            </button>

            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {copyState === "copied" && "복사 완료"}
              {copyState === "failed" && "복사 실패"}
            </div>
          </div>
        </section>

        {compareResults.length === 0 ? (
          <section
            style={{
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: 20,
              opacity: 0.8,
            }}
          >
            아직 compare 결과가 없다. 상단에서{" "}
            <strong>Run all scenarios</strong>를 눌러 실행하면 된다.
          </section>
        ) : (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 16,
              }}
            >
              {compareResults.map((item) => {
                const summary = item.result
                  ? buildScenarioSummary(item.result)
                  : null;

                return (
                  <article
                    key={item.name}
                    style={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 16,
                      padding: 16,
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                          status={item.status}
                          {item.durationMs != null ? ` · ${item.durationMs}ms` : ""}
                        </div>
                      </div>
                    </div>

                    {item.error && (
                      <div style={{ marginTop: 12, color: "#fca5a5" }}>
                        error: {item.error}
                      </div>
                    )}

                    {summary && (
                      <div
                        style={{
                          marginTop: 16,
                          display: "grid",
                          gap: 8,
                          fontSize: 14,
                        }}
                      >
                        <div>repairCount: {summary.totalRepairs}</div>
                        <div>overflowDays: {summary.overflowDays}</div>
                        <div>
                          missingRecoveryCount: {summary.missingRecoveryCount}
                        </div>
                        <div>
                          lateFallbackMissCount: {summary.lateFallbackMissCount}
                        </div>
                        <div>softMissCount: {summary.softMissCount}</div>
                        <div>
                          timeWindowViolationCount:{" "}
                          {summary.timeWindowViolationCount}
                        </div>
                        <div>
                          planningInfeasibleDays:{" "}
                          {summary.planningInfeasibleDays}
                        </div>
                        <div>
                          previewConflictDays: {summary.previewConflictDays}
                        </div>
                        <div>
                          previewTotalConflicts: {summary.previewTotalConflicts}
                        </div>
                        <div>
                          previewStatusCounts:{" "}
                          {Object.entries(summary.previewStatusCounts)
                            .map(([key, value]) => `${key}:${value}`)
                            .join(", ") || "none"}
                        </div>
                        <div>
                          statusCounts:{" "}
                          {Object.entries(summary.statusCounts)
                            .map(([key, value]) => `${key}:${value}`)
                            .join(", ") || "none"}
                        </div>

                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                          {summary.dayLines.map((line) => (
                            <div key={line} style={{ marginBottom: 4 }}>
                              • {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>

            <section
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: 16,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 12 }}>
                Combined diagnostics text
              </div>

              <textarea
                readOnly
                value={compareText}
                style={{
                  width: "100%",
                  minHeight: 420,
                  resize: "vertical",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "#0f172a",
                  color: "white",
                  padding: 12,
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
