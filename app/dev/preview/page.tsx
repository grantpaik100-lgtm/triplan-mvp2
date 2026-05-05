"use client";
/**
 * TriPlan V4
 * Current Role:
 * - Scheduling Preview 결과를 직접 실행하고 확인하는 dev 전용 preview UI다.
 *
 * Target Role:
 * - Decision 결과의 시간/피로/충돌/trade-off를 사람이 확인할 수 있는 내부 검증 화면.
 *
 * Chain:
 * - generate | engine | preview
 *
 * Inputs:
 * - dev scenario
 *
 * Outputs:
 * - schedulingPreview diagnostics
 * - selectedExperienceIds
 * - conflicts / tradeOffs / alternatives
 *
 * Called From:
 * - /dev/preview
 *
 * Side Effects:
 * - fetch / clipboard
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
  FOCUS_RING,
  GLASS,
  MAXWIDTH,
  MOTION,
  RADIUS,
  SHADOW,
  SPACE,
  TYPE,
} from "@/lib/MOTION_TOKENS";

type RunnerStatus = "idle" | "running" | "success" | "error";

type PreviewRunState = {
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

function getStatusLabel(status?: string) {
  if (!status) return "unknown";
  return status;
}

function getPreviewText(result?: TripPlanResult) {
  if (!result?.debug?.schedulingPreview) return "No preview result";

  const lines: string[] = [];
  const preview = result.debug.schedulingPreview;

  lines.push("TRIPLAN SCHEDULING PREVIEW");
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
    lines.push(`selectedExperienceIds=${day.selectedExperienceIds.join(",") || "none"}`);
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

  return lines.join("\n");
}

const density = DENSITY.base;

export default function DevPreviewPage() {
  const scenarioNames = getScenarioNames();
  const [selectedScenario, setSelectedScenario] = useState(
    scenarioNames[0] ?? "",
  );
  const [runState, setRunState] = useState<PreviewRunState>({
    status: "idle",
  });
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const preview = runState.result?.debug?.schedulingPreview;
  const selectedLogs = runState.result?.debug?.selectedOptions ?? [];

  const previewText = useMemo(
    () => getPreviewText(runState.result),
    [runState.result],
  );

  async function runPreview() {
    setRunState({ status: "running" });
    setCopyState("idle");

    const scenario = loadScenario(selectedScenario);

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
        setRunState({
          status: "error",
          durationMs,
          error: data.detail ?? data.error ?? "Failed to generate trip",
        });
        return;
      }

      setRunState({
        status: "success",
        durationMs,
        result: data.result as TripPlanResult,
      });
    } catch (error) {
      setRunState({
        status: "error",
        durationMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async function copyPreviewText() {
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
            transform: `scale(${MOTION.enter.to.scale})`,
          }}
        >
          <div style={{ display: "grid", gap: SPACE[8] }}>
            <div
              style={{
                fontSize: TYPE.h1.size,
                lineHeight: TYPE.h1.lineHeight,
                fontWeight: TYPE.h1.weight,
              }}
            >
              Scheduling Preview Dev
            </div>
            <div
              style={{
                color: COLORS.muted,
                fontSize: TYPE.body.size,
                lineHeight: TYPE.body.lineHeight,
                fontWeight: TYPE.body.weight,
              }}
            >
              Decision 선택 결과의 시간, 피로, 충돌, trade-off를 확인하는 V4
              내부 검증 화면.
            </div>
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
            <select
              value={selectedScenario}
              onChange={(event) => setSelectedScenario(event.target.value)}
              style={{
                minHeight: density.buttonHeight,
                paddingInline: SPACE[14],
                borderRadius: RADIUS.md,
                border: GLASS.border,
                background: GLASS.background,
                color: COLORS.text,
                fontSize: TYPE.body.size,
                fontWeight: TYPE.body.weight,
                outline: "none",
              }}
              onFocus={(event) => {
                event.currentTarget.style.boxShadow = FOCUS_RING.ring;
              }}
              onBlur={(event) => {
                event.currentTarget.style.boxShadow = "none";
              }}
            >
              {scenarioNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={runPreview}
              disabled={runState.status === "running"}
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
                cursor: runState.status === "running" ? "default" : "pointer",
              }}
            >
              {runState.status === "running" ? "Running..." : "Run Preview"}
            </button>

            <button
              type="button"
              onClick={copyPreviewText}
              disabled={!runState.result}
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
                cursor: runState.result ? "pointer" : "default",
              }}
            >
              Copy Preview
            </button>

            <span
              style={{
                color: COLORS.muted,
                fontSize: TYPE.caption.size,
                lineHeight: TYPE.caption.lineHeight,
                fontWeight: TYPE.caption.weight,
              }}
            >
              status={runState.status}
              {runState.durationMs != null ? ` · ${runState.durationMs}ms` : ""}
              {copyState === "copied" ? " · copied" : ""}
              {copyState === "failed" ? " · copy failed" : ""}
            </span>
          </div>
        </section>

        {runState.error && (
          <section
            style={{
              padding: density.cardPadY,
              borderRadius: RADIUS.lg,
              background: GLASS.background,
              border: GLASS.border,
              boxShadow: SHADOW.level1,
              color: COLORS.danger,
              fontSize: TYPE.body.size,
              lineHeight: TYPE.body.lineHeight,
              fontWeight: TYPE.body.weight,
            }}
          >
            {runState.error}
          </section>
        )}

        {preview && (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: SPACE[12],
              }}
            >
              {[
                ["safe", preview.diagnostics.safeDays],
                ["tight", preview.diagnostics.tightDays],
                ["conflict", preview.diagnostics.conflictDays],
                ["conflicts", preview.diagnostics.totalConflictCount],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    padding: density.cardPadY,
                    borderRadius: RADIUS.lg,
                    background: GLASS.background,
                    border: GLASS.border,
                    boxShadow: SHADOW.level1,
                  }}
                >
                  <div
                    style={{
                      color: COLORS.muted,
                      fontSize: TYPE.caption.size,
                      lineHeight: TYPE.caption.lineHeight,
                      fontWeight: TYPE.caption.weight,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      marginTop: SPACE[4],
                      fontSize: TYPE.h2.size,
                      lineHeight: TYPE.h2.lineHeight,
                      fontWeight: TYPE.h2.weight,
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </section>

            <section style={{ display: "grid", gap: SPACE[14] }}>
              {preview.days.map((day) => {
                const selectedLog = selectedLogs.find(
                  (log) => log.dayIndex === day.dayIndex,
                );

                return (
                  <article
                    key={day.dayIndex}
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
                        display: "flex",
                        justifyContent: "space-between",
                        gap: SPACE[12],
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: TYPE.h2.size,
                            lineHeight: TYPE.h2.lineHeight,
                            fontWeight: TYPE.h2.weight,
                          }}
                        >
                          Day {day.dayIndex} · {day.structureType}
                        </div>
                        <div
                          style={{
                            marginTop: SPACE[4],
                            color: COLORS.muted,
                            fontSize: TYPE.caption.size,
                            lineHeight: TYPE.caption.lineHeight,
                            fontWeight: TYPE.caption.weight,
                          }}
                        >
                          selected:{" "}
                          {day.selectedExperienceIds.join(", ") || "none"}
                        </div>
                      </div>

                      <div
                        style={{
                          paddingInline: SPACE[12],
                          paddingBlock: SPACE[6],
                          borderRadius: RADIUS.pill,
                          border: GLASS.border,
                          fontSize: TYPE.caption.size,
                          lineHeight: TYPE.caption.lineHeight,
                          fontWeight: TYPE.caption.weight,
                        }}
                      >
                        {getStatusLabel(day.status)}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: SPACE[10],
                      }}
                    >
                      <Metric label="total" value={`${day.analysis.estimatedTotalMinutes}m`} />
                      <Metric label="available" value={`${day.analysis.availableMinutes}m`} />
                      <Metric label="buffer" value={`${day.analysis.bufferMinutes}m`} />
                      <Metric label="fatigue" value={String(day.analysis.estimatedFatigue)} />
                    </div>

                    <div
                      style={{
                        color: COLORS.muted,
                        fontSize: TYPE.body.size,
                        lineHeight: TYPE.body.lineHeight,
                        fontWeight: TYPE.body.weight,
                      }}
                    >
                      {day.analysis.summary}
                    </div>

                    {selectedLog && (
                      <div
                        style={{
                          display: "grid",
                          gap: SPACE[6],
                          padding: SPACE[12],
                          borderRadius: RADIUS.md,
                          border: GLASS.border,
                        }}
                      >
                        <SectionTitle>Selected options</SectionTitle>
                        <div style={smallTextStyle}>
                          peak: {selectedLog.selectedOptions.peak?.title ?? "none"}
                        </div>
                        <div style={smallTextStyle}>
                          recovery:{" "}
                          {selectedLog.selectedOptions.recovery?.title ?? "none"}
                        </div>
                        <div style={smallTextStyle}>
                          support:{" "}
                          {selectedLog.selectedOptions.support
                            .map((option) => option.title)
                            .join(", ") || "none"}
                        </div>
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
                  </article>
                );
              })}
            </section>
          </>
        )}

        {!preview && !runState.error && (
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
            scenario를 선택하고 Run Preview를 누르면 Scheduling Preview 결과가
            표시된다.
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: SPACE[12],
        borderRadius: RADIUS.md,
        border: GLASS.border,
      }}
    >
      <div style={smallMutedStyle}>{label}</div>
      <div
        style={{
          marginTop: SPACE[4],
          fontSize: TYPE.title.size,
          lineHeight: TYPE.title.lineHeight,
          fontWeight: TYPE.title.weight,
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
        padding: SPACE[12],
        borderRadius: RADIUS.md,
        border: GLASS.border,
      }}
    >
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: TYPE.caption.size,
        lineHeight: TYPE.caption.lineHeight,
        fontWeight: TYPE.caption.weight,
      }}
    >
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
  fontSize: TYPE.tiny.size,
  lineHeight: TYPE.tiny.lineHeight,
  fontWeight: TYPE.tiny.weight,
} as const;
