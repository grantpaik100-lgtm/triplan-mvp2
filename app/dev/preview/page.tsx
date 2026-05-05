"use client";
/**
 * TriPlan V4
 * Current Role:
 * - 모든 dev scenario의 Scheduling Preview 결과를 한 번에 실행하고 비교하는 내부 검증 UI다.
 *
 * Target Role:
 * - Decision 결과의 시간/피로/충돌/trade-off를 scenario별로 빠르게 비교하는 Preview Runner.
 *
 * Chain:
 * - generate | engine | preview
 *
 * Inputs:
 * - dev scenarios
 *
 * Outputs:
 * - scenario별 schedulingPreview diagnostics
 * - combined preview text
 *
 * Called From:
 * - /dev/preview
 *
 * Side Effects:
 * - fetch
 * - clipboard
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
 * - 사용자용 UI가 아니라 V4 Scheduling Preview 검증용 내부 화면이다.
 * - Scheduling은 선택을 수정하지 않고 결과를 설명하는 mirror 역할만 한다.
 */

import { useMemo, useState } from "react";
import { getScenarioNames, loadScenario } from "@/lib/trip/scenarioLoader";
import type { TripPlanResult } from "@/lib/trip/types";
import {
  COLORS,
  DENSITY,
  GLASS,
  MAXWIDTH,
  RADIUS,
  SHADOW,
  SPACE,
  TYPE,
} from "@/lib/MOTION_TOKENS";

type RunnerStatus = "idle" | "running" | "success" | "error";

type PreviewScenarioResult = {
  name: string;
  status: RunnerStatus;
  durationMs?: number;
  result?: TripPlanResult;
  error?: string;
};

const density = DENSITY.base;

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

function buildPreviewText(results: PreviewScenarioResult[]) {
  const lines: string[] = [];

  lines.push("TRIPLAN SCHEDULING PREVIEW COMPARE");
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

    const preview = item.result?.debug?.schedulingPreview;

    if (!preview) {
      lines.push("preview=none");
      lines.push("");
      continue;
    }

    lines.push(`totalDays=${preview.diagnostics.totalDays}`);
    lines.push(`safeDays=${preview.diagnostics.safeDays}`);
    lines.push(`tightDays=${preview.diagnostics.tightDays}`);
    lines.push(`conflictDays=${preview.diagnostics.conflictDays}`);
    lines.push(`totalConflictCount=${preview.diagnostics.totalConflictCount}`);
    lines.push("");

    for (const day of preview.days) {
      lines.push(`DAY ${day.dayIndex}`);
      lines.push(`status=${day.status}`);
      lines.push(`structure=${day.structureType}`);
      lines.push(`quality=${day.quality}`);
      lines.push(`qualityScore=${day.qualityScore}`);
      lines.push(`qualitySummary=${day.qualitySummary}`);

      for (const suggestion of day.suggestions ?? []) {
        lines.push(`suggestion=${suggestion}`);
      }


      
      lines.push(
        `selectedExperienceIds=${day.selectedExperienceIds.join(",") || "none"}`,
      );
      lines.push(`estimatedTotalMinutes=${day.analysis.estimatedTotalMinutes}`);
      lines.push(`availableMinutes=${day.analysis.availableMinutes}`);
      lines.push(`bufferMinutes=${day.analysis.bufferMinutes}`);
      lines.push(`estimatedFatigue=${day.analysis.estimatedFatigue}`);
      lines.push(`summary=${day.analysis.summary}`);

      for (const conflict of day.conflicts) {
        lines.push(
          `conflict=${conflict.type} severity=${conflict.severity} message=${conflict.message}`,
        );
      }

      for (const tradeOff of day.tradeOffs) {
        lines.push(`tradeOff=${tradeOff}`);
      }

      for (const alternative of day.alternatives) {
        lines.push(`alternative=${alternative.title}`);
      }

      lines.push("");
    }

    lines.push("--------------------------------------------------");
    lines.push("");
  }

  return lines.join("\n");
}

async function runScenarioPreview(name: string): Promise<PreviewScenarioResult> {
  const scenario = loadScenario(name);

  const primaryResult = {
    ...scenario.primaryResult,
    completedAt: new Date().toISOString(),
    source: "dev_preview",
    scenarioName: scenario.name,
  };

  const planningInput = {
    ...scenario.planningInput,
    source: "dev_preview",
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
        error: data.detail ?? data.error ?? "Failed to generate trip",
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

export default function DevPreviewPage() {
  const names = getScenarioNames();

  const [results, setResults] = useState<PreviewScenarioResult[]>([]);
  const [running, setRunning] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const previewText = useMemo(() => buildPreviewText(results), [results]);

  async function runAllPreview() {
    setRunning(true);
    setCopyState("idle");

    const initial = names.map((name) => ({
      name,
      status: "running" as RunnerStatus,
    }));

    setResults(initial);

    const nextResults: PreviewScenarioResult[] = [];

    for (const name of names) {
      const result = await runScenarioPreview(name);
      nextResults.push(result);
      setResults([...nextResults]);
    }

    setRunning(false);
  }

  async function copyAllPreview() {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: SPACE[24],
        color: COLORS.text,
        background: `linear-gradient(180deg, ${COLORS.sky1}, ${COLORS.sky2})`,
      }}
    >
      <div
        style={{
          maxWidth: MAXWIDTH.itinerary,
          margin: "0 auto",
          display: "grid",
          gap: SPACE[20],
        }}
      >
        <section
          style={{
            padding: density.cardPadY,
            borderRadius: RADIUS.xl,
            background: GLASS.background,
            border: GLASS.border,
            boxShadow: SHADOW.level2,
            backdropFilter: `blur(${GLASS.backdropBlurPx}px)`,
          }}
        >
          <div
            style={{
              fontSize: TYPE.h1.size,
              lineHeight: TYPE.h1.lineHeight,
              fontWeight: TYPE.h1.weight,
            }}
          >
            Scheduling Preview Compare
          </div>

          <div
            style={{
              marginTop: SPACE[8],
              color: COLORS.muted,
              fontSize: TYPE.body.size,
              lineHeight: TYPE.body.lineHeight,
              fontWeight: TYPE.body.weight,
            }}
          >
            모든 dev scenario를 한 번에 실행해서 Decision 선택 결과의
            시간·피로·trade-off를 비교한다.
          </div>

          <div
            style={{
              marginTop: SPACE[20],
              display: "flex",
              flexWrap: "wrap",
              gap: SPACE[10],
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={runAllPreview}
              disabled={running}
              style={{
                minHeight: density.buttonHeight,
                paddingInline: SPACE[18],
                borderRadius: RADIUS.pill,
                border: GLASS.border,
                background: COLORS.text,
                color: COLORS.sky2,
                fontSize: TYPE.body.size,
                fontWeight: TYPE.body.weight,
                boxShadow: SHADOW.level1,
                cursor: running ? "default" : "pointer",
              }}
            >
              {running ? "Running all..." : "Run All Preview"}
            </button>

            <button
              type="button"
              onClick={copyAllPreview}
              disabled={results.length === 0}
              style={{
                minHeight: density.buttonHeight,
                paddingInline: SPACE[18],
                borderRadius: RADIUS.pill,
                border: GLASS.border,
                background: GLASS.background,
                color: COLORS.text,
                fontSize: TYPE.body.size,
                fontWeight: TYPE.body.weight,
                boxShadow: SHADOW.level1,
                cursor: results.length === 0 ? "default" : "pointer",
              }}
            >
              Copy All Preview
            </button>

            <span
              style={{
                color: COLORS.muted,
                fontSize: TYPE.caption.size,
                lineHeight: TYPE.caption.lineHeight,
                fontWeight: TYPE.caption.weight,
              }}
            >
              scenarios={names.length}
              {copyState === "copied" ? " · copied" : ""}
              {copyState === "failed" ? " · copy failed" : ""}
            </span>
          </div>
        </section>

        {results.length === 0 ? (
          <section
            style={{
              padding: density.cardPadY,
              borderRadius: RADIUS.xl,
              background: GLASS.background,
              border: GLASS.border,
              boxShadow: SHADOW.level1,
              color: COLORS.muted,
              fontSize: TYPE.body.size,
              lineHeight: TYPE.body.lineHeight,
              fontWeight: TYPE.body.weight,
            }}
          >
            Run All Preview를 누르면 세 scenario의 preview 결과가 한 번에
            표시된다.
          </section>
        ) : (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: SPACE[14],
              }}
            >
              {results.map((item) => {
                const preview = item.result?.debug?.schedulingPreview;

                return (
                  <article
                    key={item.name}
                    style={{
                      padding: density.cardPadY,
                      borderRadius: RADIUS.xl,
                      background: GLASS.background,
                      border: GLASS.border,
                      boxShadow: SHADOW.level1,
                      display: "grid",
                      gap: SPACE[10],
                    }}
                  >
                    <div
                      style={{
                        fontSize: TYPE.title.size,
                        lineHeight: TYPE.title.lineHeight,
                        fontWeight: TYPE.title.weight,
                      }}
                    >
                      {item.name}
                    </div>

                    <div style={smallMutedStyle}>
                      status={item.status}
                      {item.durationMs != null ? ` · ${item.durationMs}ms` : ""}
                    </div>

                    {item.error && (
                      <div
                        style={{
                          color: COLORS.danger,
                          fontSize: TYPE.caption.size,
                          lineHeight: TYPE.caption.lineHeight,
                          fontWeight: TYPE.caption.weight,
                        }}
                      >
                        {item.error}
                      </div>
                    )}

                    {preview && (
                      <div style={{ display: "grid", gap: SPACE[6] }}>
                        <Line
                          text={`safe=${preview.diagnostics.safeDays}, tight=${preview.diagnostics.tightDays}, conflict=${preview.diagnostics.conflictDays}`}
                        />
                        <Line
                          text={`totalConflictCount=${preview.diagnostics.totalConflictCount}`}
                        />
                      </div>
                    )}
                  </article>
                );
              })}
            </section>

            <section style={{ display: "grid", gap: SPACE[16] }}>
              {results.map((item) => {
                const preview = item.result?.debug?.schedulingPreview;
                const selectedLogs = item.result?.debug?.selectedOptions ?? [];

                if (!preview) return null;

                return (
                  <article
                    key={`${item.name}-detail`}
                    style={{
                      padding: density.cardPadY,
                      borderRadius: RADIUS.xl,
                      background: GLASS.background,
                      border: GLASS.border,
                      boxShadow: SHADOW.level2,
                      display: "grid",
                      gap: SPACE[14],
                    }}
                  >
                    <div
                      style={{
                        fontSize: TYPE.h2.size,
                        lineHeight: TYPE.h2.lineHeight,
                        fontWeight: TYPE.h2.weight,
                      }}
                    >
                      {item.name}
                    </div>

                    {preview.days.map((day) => {
                      const selectedLog = selectedLogs.find(
                        (log) => log.dayIndex === day.dayIndex,
                      );

                      return (
                        <div
                          key={`${item.name}-${day.dayIndex}`}
                          style={{
                            padding: SPACE[12],
                            borderRadius: RADIUS.lg,
                            border: GLASS.border,
                            display: "grid",
                            gap: SPACE[8],
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: SPACE[12],
                            }}
                          >
                            <div
                              style={{
                                fontSize: TYPE.title.size,
                                lineHeight: TYPE.title.lineHeight,
                                fontWeight: TYPE.title.weight,
                              }}
                            >
                              Day {day.dayIndex} · {day.structureType}
                            </div>

                            <div style={smallMutedStyle}>
                              {day.status} · {day.quality} · {day.qualityScore}
                          </div>
                          </div>

                          <div style={smallTextStyle}>
                            selected:{" "}
                            {day.selectedExperienceIds.join(", ") || "none"}
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(120px, 1fr))",
                              gap: SPACE[8],
                            }}
                          >
                            <Metric
                              label="total"
                              value={`${day.analysis.estimatedTotalMinutes}m`}
                            />
                            <Metric
                              label="available"
                              value={`${day.analysis.availableMinutes}m`}
                            />
                            <Metric
                              label="buffer"
                              value={`${day.analysis.bufferMinutes}m`}
                            />
                            <Metric
                              label="fatigue"
                              value={String(day.analysis.estimatedFatigue)}
                            />
                          </div>

                          <div style={smallMutedStyle}>
                            {day.analysis.summary}
                          </div>
                          <div style={smallTextStyle}>
                            quality: {day.qualitySummary}
                          </div>
                          {selectedLog && (
                            <div style={smallTextStyle}>
                              peak:{" "}
                              {selectedLog.selectedOptions.peak?.title ??
                                "none"}{" "}
                              / recovery:{" "}
                              {selectedLog.selectedOptions.recovery?.title ??
                                "none"}{" "}
                              / support:{" "}
                              {selectedLog.selectedOptions.support
                                .map((option) => option.title)
                                .join(", ") || "none"}
                            </div>
                          )}

                          <Block title="Conflicts">
                            {day.conflicts.length === 0 ? (
                              <Line text="none" />
                            ) : (
                              day.conflicts.map((conflict, index) => (
                                <Line
                                  key={`${conflict.type}-${index}`}
                                  text={`${conflict.type} · ${conflict.severity} · ${conflict.message}`}
                                />
                              ))
                            )}
                          </Block>

                          <Block title="Trade-offs">
                            {day.tradeOffs.length === 0 ? (
                              <Line text="none" />
                            ) : (
                              day.tradeOffs.map((tradeOff, index) => (
                                <Line key={index} text={tradeOff} />
                              ))
                            )}
                          </Block>

                          <Block title="Alternatives">
                            {day.alternatives.length === 0 ? (
                              <Line text="none" />
                            ) : (
                              day.alternatives.map((alternative) => (
                                <Line
                                  key={alternative.id}
                                  text={`${alternative.title} — ${alternative.description}`}
                                />
                              ))
                            )}
                          </Block>
                        </div>
                      );
                    })}
                  </article>
                );
              })}
            </section>

            <section
              style={{
                padding: density.cardPadY,
                borderRadius: RADIUS.xl,
                background: GLASS.background,
                border: GLASS.border,
                boxShadow: SHADOW.level1,
              }}
            >
              <div
                style={{
                  fontSize: TYPE.title.size,
                  lineHeight: TYPE.title.lineHeight,
                  fontWeight: TYPE.title.weight,
                  marginBottom: SPACE[10],
                }}
              >
                Combined Preview Text
              </div>

              <textarea
                readOnly
                value={previewText}
                style={{
                  width: "100%",
                  minHeight: 420,
                  padding: SPACE[12],
                  borderRadius: RADIUS.lg,
                  border: GLASS.border,
                  background: GLASS.background,
                  color: COLORS.text,
                  fontSize: TYPE.caption.size,
                  lineHeight: TYPE.caption.lineHeight,
                  fontWeight: TYPE.caption.weight,
                }}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: SPACE[10],
        borderRadius: RADIUS.md,
        border: GLASS.border,
      }}
    >
      <div style={smallMutedStyle}>{label}</div>
      <div
        style={{
          marginTop: SPACE[4],
          fontSize: TYPE.caption.size,
          lineHeight: TYPE.caption.lineHeight,
          fontWeight: TYPE.caption.weight,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: SPACE[6],
        padding: SPACE[10],
        borderRadius: RADIUS.md,
        border: GLASS.border,
      }}
    >
      <div
        style={{
          fontSize: TYPE.caption.size,
          lineHeight: TYPE.caption.lineHeight,
          fontWeight: TYPE.caption.weight,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Line({ text }: { text: string }) {
  return <div style={smallTextStyle}>• {text}</div>;
}

const smallTextStyle = {
  color: COLORS.text,
  fontSize: TYPE.caption.size,
  lineHeight: TYPE.caption.lineHeight,
  fontWeight: TYPE.caption.weight,
} as const;

const smallMutedStyle = {
  color: COLORS.muted,
  fontSize: TYPE.caption.size,
  lineHeight: TYPE.caption.lineHeight,
  fontWeight: TYPE.caption.weight,
} as const;
