// app/secondary/SecondarySummaryView.tsx
"use client";

import React, { useMemo, useState, useEffect } from "react";
import type { SecondaryQuestion } from "./secondaryQuestions";
import type { SecondaryAnswers } from "./secondarySchema";
import { MOTION } from "@/lib/MOTION_TOKENS";

export default function SecondarySummaryView(props: {
  questions: SecondaryQuestion[];
  answers: SecondaryAnswers | Record<string, any>;
  onEdit: (qid: string) => void;
  onBack: () => void;
}) {
  const { questions, answers, onEdit, onBack } = props;

  const sections = useMemo(() => {
    const map = new Map<string, SecondaryQuestion[]>();
    for (const q of questions) {
      const arr = map.get(q.section) ?? [];
      arr.push(q);
      map.set(q.section, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [questions]);

  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  const motionVars: React.CSSProperties = entered
    ? ({
        ["--tp2-opacity" as any]: MOTION.enter.to.opacity,
        ["--tp2-scale" as any]: MOTION.enter.to.scale,
        ["--tp2-blur" as any]: MOTION.enter.to.blurPx,
      } as React.CSSProperties)
    : ({
        ["--tp2-opacity" as any]: MOTION.enter.from.opacity,
        ["--tp2-scale" as any]: MOTION.enter.from.scale,
        ["--tp2-blur" as any]: MOTION.enter.from.blurPx,
      } as React.CSSProperties);

  return (
    <article className="tp2-card" style={motionVars} aria-label="summary-card">
      <header className="tp2-cardHeader">
        <div className="tp2-meta">Summary</div>
        <h2 className="tp2-h2">내 설정 요약 (수정 가능)</h2>
        <p className="tp2-body tp2-help">섹션별 핵심만 2줄</p>
      </header>

      <div className="tp2-controls">
        {sections.map(([sec, qs]) => (
          <div key={sec} className="tp2-card" aria-label={`section-${sec}`}>
            <div className="tp2-footer">
              <div className="tp2-h2">Section {sec}</div>
              <button
                type="button"
                className="tp2-btn"
                onClick={() => onEdit(sec as any)}
              >
                수정
              </button>
              <button type="button" className="tp2-btn" onClick={() => onEdit(qs[0]?.id ?? "")}>
  수정
</button>
            </div>

            <ul className="tp2-controls" aria-label={`summary-lines-${sec}`}>
              {summarizeSection(sec as any, answers as any).map((line, i) => (
                <li key={i} className="tp2-body">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <footer className="tp2-footer">
        <button type="button" className="tp2-btn" onClick={onBack}>
          질문으로
        </button>
        <button type="button" className="tp2-btnPrimary" disabled>
          LLM Assist (옵션 A: 비활성)
        </button>
      </footer>
    </article>
  );
}

function summarizeSection(section: "A" | "B" | "C" | "D" | "E" | "F", a: any): string[] {
  switch (section) {
    case "A":
      return [`리듬: ${a.a_rhythm ?? "미선택"}`, `밀도: ${a.a_density ?? "미선택"}`];
    case "B":
      return [
        `알러지/제외: ${(a.b_allergyTags ?? []).length ? (a.b_allergyTags ?? []).slice(0, 4).join(", ") : "없음"}`,
        `웨이팅: ${a.b_waitingPreset === "직접" ? `${a.b_waitingCustomMinutes ?? 0}분` : `${a.b_waitingPreset ?? "미선택"}분`}`,
      ];
    case "C":
      return [
        `이동: ${(a.c_transportPrefs ?? []).length ? (a.c_transportPrefs ?? []).join(", ") : "미선택"}`,
        `제약: ${a.c_mobilityConstraint ?? "없음"}`,
      ];
    case "D":
      return [
        `숙소 전략: ${a.d_lodgingStrategy ?? "미선택"}`,
        `우선순위: ${Array.isArray(a.d_lodgingRank) ? a.d_lodgingRank.slice(0, 3).join(" > ") + " …" : "미선택"}`,
      ];
    case "E":
      return [`모드: ${a.e_groupMode ?? "혼자"}`, `규칙: ${a.e_conflictRule ?? "미선택"}`];
    case "F":
      return [
        `장소: ${a.f_places?.[0]?.name ?? "미입력"}${a.f_places?.length > 1 ? ` 외 ${a.f_places.length - 1}개` : ""}`,
        `핵심 이유: ${a.f_placeReasonOneLine ?? "미입력"}`,
      ];
    default:
      return [];
  }
}
